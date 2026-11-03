"""S88 TESScut: own photometry at several apertures; where in the pixels is the ~2 d variability, and where is the dip?"""
import warnings; warnings.filterwarnings("ignore")
import glob, json, numpy as np, lightkurve as lk
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
from astropy.table import Table
from scipy.ndimage import median_filter
from measure import trapezoid
from cfg import *
tpf=lk.read(glob.glob("data/tesscut/**/tess-s0088*.fits",recursive=True)[0])
t=tpf.time.value; F=tpf.flux.value.astype(float); q=tpf.quality
fin=np.all(np.isfinite(F),axis=(1,2))&(q==0)
t=t[fin]; F=F[fin]
med=np.nanmedian(F,0); ny,nx=med.shape
Y,X=np.mgrid[:ny,:nx]
g=Table.read("data/gaia_2arcmin.csv"); gx,gy=tpf.wcs.world_to_pixel_values(np.array(g["ra"]),np.array(g["dec"])); xt,yt=gx[0],gy[0]
r=np.hypot(X-xt,Y-yt)
faint=(med<np.nanpercentile(med,30))&(r>4); bkg=np.nanmedian(F[:,faint],1); Fb=F-bkg[:,None,None]
out={"target_px":[float(xt),float(yt)]}
LC={}
for rap in [1.0,1.5,2.5,3.5]:
    ap=r<=rap; lc=Fb[:,ap].sum(1); LC[rap]=lc/np.median(lc)
    # variability amplitude: 2-98 percentile range of a 0.1 d median-smoothed curve
    sm=median_filter(LC[rap],size=37); out[f"r{rap}_ptp_2_98"]=float(np.ptp(np.percentile(sm,[2,98]))); out[f"r{rap}_npix"]=int(ap.sum())
    print(f"r={rap} npix {ap.sum()} variability p2p {out[f'r{rap}_ptp_2_98']*100:.2f}%")
# variability signal = smoothed r1.5 LC; regress each pixel on it (+ const + linear in time)
v=median_filter(LC[1.5],size=37)-1
A=np.vstack([v,np.ones_like(t),t-t.mean()]).T
amp=np.zeros((ny,nx))
for yy in range(ny):
    for xx in range(nx):
        amp[yy,xx]=np.linalg.lstsq(A,Fb[:,yy,xx],rcond=None)[0][0]
def centroid(img,x0,y0,rad=2.5):
    m=(np.hypot(X-x0,Y-y0)<=rad)&(img>0); return float((img[m]*X[m]).sum()/img[m].sum()),float((img[m]*Y[m]).sum()/img[m].sum())
cm=centroid(np.nanmedian(Fb,0),xt,yt); ca=centroid(amp,xt,yt)
pix_arcsec=21.0
out["median_centroid"]=cm; out["variability_centroid"]=ca
out["var_minus_median_arcsec"]=float(np.hypot(ca[0]-cm[0],ca[1]-cm[1])*pix_arcsec)
nb=1  # Gaia neighbour at 13"
ib=int(np.argmin(np.abs(np.array(g["sep"])-12.9)))
out["neighbour_13arcsec_px"]=[float(gx[ib]),float(gy[ib])]
# expected centroid of the amplitude image if the neighbour were the variable: its own PSF centre (approx.)
print("median-image centroid",cm,"variability centroid",ca,"offset",out["var_minus_median_arcsec"],"arcsec")
print("target",xt,yt,"13\" neighbour",gx[ib],gy[ib],"Gaia sep",g["sep"][ib])
# bootstrap-ish error: centroid of amplitude images from the two halves of the sector
half=t<np.median(t); cs=[]
for hm in [half,~half]:
    Ah=A[hm]; a2=np.zeros((ny,nx))
    for yy in range(ny):
        for xx in range(nx): a2[yy,xx]=np.linalg.lstsq(Ah,Fb[hm][:,yy,xx],rcond=None)[0][0]
    cs.append(centroid(a2,xt,yt))
out["variability_centroid_halves"]=cs; print("halves",cs)
# dip image: per pixel 4 h box at TC with local quadratic baseline (±0.6 d) - raw, and the same box at the mirror time (TC-0.486)
def boximg(tc,order=4,win=0.6):
    w=np.abs(t-tc)<win; tt=t[w]; s=trapezoid(tt,tc,DUR); B=np.vstack([-s]+[((tt-tc)/win)**k for k in range(order+1)]).T
    D=np.zeros((ny,nx)); E=np.zeros((ny,nx))
    for yy in range(ny):
        for xx in range(nx):
            vv=Fb[w,yy,xx]; c=np.linalg.lstsq(B,vv,rcond=None)[0]; D[yy,xx]=c[0]; E[yy,xx]=np.sqrt(np.linalg.pinv(B.T@B)[0,0])*np.std(vv-B@c)
    return D,E
for rap in [1.0,1.5,2.5,3.5]:
    w=np.abs(t-TC)<0.6; tt=t[w]; s=trapezoid(tt,TC,DUR); B=np.vstack([-s]+[((tt-TC)/0.6)**k for k in range(5)]).T
    c=np.linalg.lstsq(B,LC[rap][w],rcond=None)[0]; e=np.sqrt(np.linalg.pinv(B.T@B)[0,0])*np.std(LC[rap][w]-B@c)
    out[f"own_r{rap}_poly4_depth_ppt"]=(round(c[0]*1e3,2),round(e*1e3,2)); print(f"own r={rap} 4h box, poly4 ±0.6 d: {c[0]*1e3:.2f} ± {e*1e3:.2f} ppt")
D,E=boximg(TC); cd=centroid(D,xt,yt)
out["dip_centroid"]=cd; out["dip_minus_median_arcsec"]=float(np.hypot(cd[0]-cm[0],cd[1]-cm[1])*pix_arcsec)
ap=r<=1.5; out["dip_r1.5_from_pixels_ppt"]=float(D[ap].sum()/np.nanmedian(Fb,0)[ap].sum()*1e3)
# dip vs variability amplitude, per pixel ratio within r<=2 (constant ratio = same source)
m=r<=2.0; ratio=D[m]/amp[m]; out["dip_over_amp_pixels_r2"]={"median":float(np.median(ratio)),"sd":float(np.std(ratio))}
print("dip centroid",cd,"offset from median",out["dip_minus_median_arcsec"],"arcsec; dip/var-amp per pixel",out["dip_over_amp_pixels_r2"])
json.dump(out,open("data/step4_pixels.json","w"),indent=1,default=float)
fig,ax=plt.subplots(1,3,figsize=(15,4.6))
for a,img,ttl in zip(ax,[np.log10(np.clip(np.nanmedian(Fb,0),1,None)),amp,D],["median (log e/s)","per-pixel amplitude of the ~2 d variability","per-pixel 4 h box depth at 3712.786"]):
    im=a.imshow(img,origin="lower"); plt.colorbar(im,ax=a,fraction=.046); a.set_title(ttl,fontsize=9)
    b=np.array(g["phot_g_mean_mag"])<19; a.scatter(gx[b],gy[b],s=np.clip((20-np.array(g['phot_g_mean_mag'])[b])*8,5,200),facecolors='none',edgecolors='w',lw=.7)
    a.plot(xt,yt,'r+',ms=12,mew=2); a.plot(*ca,'mx',ms=10,mew=2); a.set_xlim(5.5,15.5); a.set_ylim(5.5,15.5)
plt.tight_layout(); plt.savefig("figs/pixels_s88.png",dpi=90)
