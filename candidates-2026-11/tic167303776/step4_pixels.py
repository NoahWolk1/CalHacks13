"""S5 SPOC 2-min TPF: (a) per-pixel event deficit at 1456.295 (3.6 h box vs ±0.5 d local linear baseline), PRF-like centroid of the deficit vs Gaia;
(b) per-pixel regression of every pixel on the aperture's 'dip signal' (whole sector) -> where do ALL the dips live; (c) required eclipse depth for each Gaia neighbour."""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, json, lightkurve as lk, glob
from astropy.table import Table
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
f=glob.glob("data/tpf/**/*s0005*tp.fits",recursive=True)
tpf=lk.read(f[0]) if f else lk.search_targetpixelfile("TIC 167303776",sector=5,author="SPOC").download(download_dir="data/tpf")
t=tpf.time.value; F=tpf.flux.value.astype(float); q=tpf.quality; ok=np.all(np.isfinite(F),axis=(1,2))&(q==0); t,F=t[ok],F[ok]
ap=tpf.pipeline_mask; ny,nx=F.shape[1:]
g=Table.read("data/gaia_2arcmin.csv"); gx,gy=tpf.wcs.world_to_pixel_values(np.array(g["ra"]),np.array(g["dec"]))
TC,DUR=1456.295,0.15
w=np.abs(t-TC)<0.5; ins=np.abs(t-TC)<DUR/2; oot=w&~(np.abs(t-TC)<DUR/2+0.05)
D=np.zeros((ny,nx)); E=np.zeros((ny,nx))
for y in range(ny):
    for x in range(nx):
        v=F[:,y,x]; c=np.polyfit(t[oot]-TC,v[oot],1); res=v-np.polyval(c,t-TC)
        D[y,x]=-res[ins&w].mean(); E[y,x]=res[oot].std()/np.sqrt(ins.sum())*3   # x3 for red noise (beta~5 at 2-min, ~3 at box)
med=np.median(F[w],0)
lc=F[:,ap].sum(1); print("aperture event depth (pixel box, ppt):",D[ap].sum()/med[ap].sum()*1e3)
# (b) dip-signal regression over the whole sector: s(t)= min(0, lc/1d-upper-envelope - 1)
nb=15; base=np.array([np.percentile(lc[np.abs(t-x)<1.0],80) for x in t[::nb]]); base=np.interp(t,t[::nb],base)
s=np.minimum(lc/base-1,0); A=np.column_stack([s*med[ap].sum()/1.0,np.ones_like(t),t-t.mean(),(t-t.mean())**2])
Simg=np.zeros((ny,nx))
for y in range(ny):
    for x in range(nx):
        v=F[:,y,x]; Bv=np.interp(t,t[::nb],np.array([np.percentile(v[np.abs(t-xx)<1.0],80) for xx in t[::nb]]))
        c=np.linalg.lstsq(np.column_stack([s,np.ones_like(t)]),v-Bv,rcond=None)[0]; Simg[y,x]=-c[0]
# PRF centroid via 2D gaussian fit to deficit images (fit both D and the median image, compare)
from scipy.optimize import least_squares
Y,X=np.mgrid[:ny,:nx]
def gfit(img):
    p0=[img.max(),gx[0],gy[0],0.7,0]
    fun=lambda p:(p[0]*np.exp(-((X-p[1])**2+(Y-p[2])**2)/(2*p[3]**2))+p[4]-img).ravel()
    r=least_squares(fun,p0); J=r.jac; cov=np.linalg.pinv(J.T@J)*np.sum(r.fun**2)/(r.fun.size-5); return r.x,np.sqrt(np.diag(cov))
out={}
for lab,img in [("median",med),("event deficit",D),("all-dips regression",Simg)]:
    p,e=gfit(img); dx,dy=(p[1]-gx[0])*21,(p[2]-gy[0])*21
    out[lab]=dict(x=p[1],y=p[2],ex=e[1],ey=e[2],offset_arcsec=float(np.hypot(dx,dy)),err_arcsec=float(np.hypot(e[1],e[2])*21),dx=dx,dy=dy)
    print(lab,{k:round(float(v),3) for k,v in out[lab].items()})
# offset of the event/all-dips centroid relative to the median-image centroid (cancels WCS error)
for lab in ["event deficit","all-dips regression"]:
    dx=(out[lab]["x"]-out["median"]["x"])*21; dy=(out[lab]["y"]-out["median"]["y"])*21
    out[lab]["offset_vs_median_arcsec"]=float(np.hypot(dx,dy)); print(lab,"offset vs median-image centroid",round(float(np.hypot(dx,dy)),2),"arcsec")
# ratio of deficit to flux per pixel
fr=D/np.clip(med,1,None); print("deficit/flux in aperture pixels: median",np.median(fr[ap]),"range",fr[ap].min(),fr[ap].max())
# neighbours: required eclipse
br=np.array(g["bp_rp"].filled(1.0)) if hasattr(g["bp_rp"],"filled") else np.array(g["bp_rp"]); G=np.array(g["phot_g_mean_mag"]); br=np.where(np.isfinite(br),br,1.0)
T=G-0.00522555*br**3+0.0891337*br**2-0.633923*br+0.0324473; fl=10**(-0.4*(T-T[0]))
rows=[]
for i in range(1,len(g)):
    need=0.14/fl[i] if fl[i]>0 else np.inf
    if g["sep"][i]<130 and need<3: rows.append(dict(source_id=int(g["source_id"][i]),sep=round(float(g["sep"][i]),1),T=round(float(T[i]),2),need=round(float(need),2)))
print("neighbours that could make 14% with an eclipse depth < 300%:",rows[:10])
need_list=[dict(source_id=int(g["source_id"][i]),sep=round(float(g["sep"][i]),1),T=round(float(T[i]),2),need=round(float(0.14/fl[i]),2)) for i in range(1,len(g)) if T[i]<17.5]
print("brightest neighbours (T<17.5):",need_list)
out["neighbours_T<17.5"]=need_list
json.dump(out,open("data/step4_pixels.json","w"),indent=1,default=float)
fig,ax=plt.subplots(1,3,figsize=(16,5))
for a,img,ttl in zip(ax,[np.log10(np.clip(med,1,None)),D,Simg],["median (log e/s)","event deficit 1456.30 (e/s)","all-dips regression coefficient"]):
    im=a.imshow(img,origin="lower"); plt.colorbar(im,ax=a,fraction=.046); a.set_title(ttl)
    b=G<19; a.scatter(gx[b],gy[b],s=np.clip((20-G[b])*12,5,200),facecolors='none',edgecolors='w'); a.plot(gx[0],gy[0],'r+',ms=14,mew=2)
    a.contour(ap,levels=[0.5],colors='c',linewidths=.8); a.set_xlim(-.5,nx-.5); a.set_ylim(-.5,ny-.5)
plt.tight_layout(); plt.savefig("figs/step4_pixels.png",dpi=100)
