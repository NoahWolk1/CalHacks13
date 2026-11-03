"""S5 TESScut: per-pixel box depth at 1449.052 (4 h box, quadratic baseline over +-0.6 d, per pixel), its noise from
boxes slid over the rest of orbit 1, aperture photometry (local fit) centred on the target and on every Gaia star
G<16.5 within 2', the QLP aperture equivalents, and the eclipse depth each neighbour would need."""
import warnings; warnings.filterwarnings("ignore")
import glob, json, numpy as np, lightkurve as lk
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
from astropy.table import Table
from measure import fit_depth
from common import RA, DEC, TC, DUR
tpf=lk.read(glob.glob("data/tesscut/**/tess-s0005*.fits",recursive=True)[0])
t=tpf.time.value; F=tpf.flux.value.astype(float); good=(tpf.quality==0)&np.all(np.isfinite(F),axis=(1,2))
med=np.nanmedian(F[good],0)
# column-wise background (faintest 40% of each column)
Fb=F.copy()
for x in range(F.shape[2]):
    sm=med[:,x]<np.nanpercentile(med[:,x],40); Fb[:,:,x]-=np.nanmedian(F[:,sm,x],axis=1)[:,None]
g=Table.read("data/gaia_2arcmin.csv"); G=np.array(g["phot_g_mean_mag"],float)
gx,gy=tpf.wcs.world_to_pixel_values(np.array(g["ra"]),np.array(g["dec"]))
xt,yt=gx[0],gy[0]
def boxdepth(y,tc,win=0.6):
    w=np.isfinite(y)&(np.abs(t-tc)<win)&good
    if w.sum()<20: return np.nan
    s=((np.abs(t[w]-tc))<DUR/2).astype(float); A=np.vstack([-s,np.ones(w.sum()),t[w]-tc,(t[w]-tc)**2]).T
    c,*_=np.linalg.lstsq(A,y[w],rcond=None); return c[0]
orbit1=good&(t<1450.4)
slide=[tc for tc in np.arange(t[orbit1].min()+0.7,t[orbit1].max()-0.7,0.1) if abs(tc-TC)>0.5]
ny,nx=med.shape; D=np.zeros((ny,nx)); E=np.zeros((ny,nx))
for yy in range(ny):
    for xx in range(nx):
        y=Fb[:,yy,xx]; D[yy,xx]=boxdepth(y,TC)
        sl=np.array([boxdepth(y,tc) for tc in slide]); E[yy,xx]=1.4826*np.nanmedian(np.abs(sl-np.nanmedian(sl)))
out=dict(target_px=[float(xt),float(yt)],n_slide=len(slide))
Y,X=np.mgrid[:ny,:nx]
def apphot(x0,y0,r):
    A=(X-x0)**2+(Y-y0)**2<=r**2; y=np.nansum(Fb[:,A],1); y[~good]=np.nan; y=y/np.nanmedian(y[good&(np.abs(t-TC)<1)])
    d=boxdepth(y,TC); sl=np.array([boxdepth(y,tc) for tc in slide]); return d,1.4826*np.nanmedian(np.abs(sl-np.nanmedian(sl))),int(A.sum()),float(np.nansum(med[A]))
aps={}
for r in [1.0,1.5,2.0,2.5,3.0,4.0]:
    d,e,n,fl=apphot(xt,yt,r); aps[f"target_r{r}"]=dict(depth_ppt=round(d*1e3,2),sig_ppt=round(e*1e3,2),npix=n); print("target r",r,aps[f"target_r{r}"])
out["apertures"]=aps
# Gaia sources that could matter: flux fraction in an r=2 px target aperture is unknown without a PSF, so give the needed eclipse depth
# relative to the TOTAL light (target + neighbour), using QLP's 15 ppt and own-phot upper limit
Gtot=-2.5*np.log10(np.sum(10**(-0.4*G[(np.hypot(gx-xt,gy-yt)<3)])))
nb=[]
for i in range(len(g)):
    sep=np.hypot(gx[i]-xt,gy[i]-yt)*21
    if G[i]>19 or sep>120: continue
    fr=10**(-0.4*(G[i]-Gtot)); rec=dict(source_id=int(g["source_id"][i]),sep_arcsec=round(float(sep),1),G=round(float(G[i]),2),px=[round(float(gx[i]),2),round(float(gy[i]),2)],
             needed_eclipse_for_15ppt=round(0.015/fr,3))
    if G[i]<16.5:
        d,e,n,fl=apphot(gx[i],gy[i],1.0); rec["own_r1_depth_ppt"]=round(d*1e3,2); rec["own_r1_sig_ppt"]=round(e*1e3,2)
    nb.append(rec)
out["neighbours"]=nb
for x in nb[:15]: print(x)
# deficit significance map
S=D/E; out["max_pixel_snr"]=float(np.nanmax(S)); out["min_pixel_snr"]=float(np.nanmin(S)); iy,ix=np.unravel_index(np.nanargmax(S),S.shape)
out["max_pixel"]=[int(ix),int(iy)]; print("pixel SNR range",np.nanmin(S),np.nanmax(S),"at",ix,iy,"target",xt,yt)
# pixels around the target
for yy in range(int(round(yt))-2,int(round(yt))+3):
    print(" ".join(f"{D[yy,xx]:+8.2f}/{E[yy,xx]:5.2f}" for xx in range(int(round(xt))-3,int(round(xt))+4)))
json.dump(out,open("data/step4_pixels.json","w"),indent=1)
fig,axs=plt.subplots(1,3,figsize=(16,5))
for a,img,ttl,cm in [(axs[0],np.log10(np.clip(med,1,None)),"S5 median image (log e/s)","viridis"),(axs[1],D,"box deficit per pixel (e/s)","RdBu_r"),(axs[2],S,"deficit / slid sigma","RdBu_r")]:
    kw=dict(vmin=-4,vmax=4) if a is axs[2] else {}
    im=a.imshow(img,origin="lower",cmap=cm,**kw); plt.colorbar(im,ax=a,fraction=.046); a.set_title(ttl,fontsize=9)
    b=G<18; a.scatter(gx[b],gy[b],s=np.clip((19-G[b])*15,5,200),facecolors="none",edgecolors="w" if a is axs[0] else "k",lw=.7); a.plot(xt,yt,"r+",ms=12)
    a.set_xlim(-.5,nx-.5); a.set_ylim(-.5,ny-.5)
fig.tight_layout(); fig.savefig("figs/step4_pixels.png",dpi=90)
