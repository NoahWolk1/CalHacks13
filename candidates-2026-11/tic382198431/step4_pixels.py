"""Per-pixel event deficit (e-/s) from TESScut, after annulus-background subtraction, with a quadratic baseline over +-1 d.
Per-pixel errors from the same fit slid over off-event times. The deficit map is then fit with:
 (a) a plane (uniform/gradient background error), (b) a PSF at the target + constant, (c) plane + target PSF,
 (d) plane + PSF at each Gaia neighbour (G<19) within 3 px. PSF = 2-D Gaussian fitted to the median image at the target.
Usage: step4_pixels.py SECTOR TC DUR_H [bkg: annulus|none]"""
import warnings, json, glob, sys; warnings.filterwarnings("ignore")
import numpy as np, lightkurve as lk
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
from astropy.coordinates import SkyCoord; import astropy.units as u
from astropy.table import Table
from scipy.optimize import least_squares
from common import RA, DEC
S=int(sys.argv[1]); TC=float(sys.argv[2]); DUR=float(sys.argv[3])/24; BK=sys.argv[4] if len(sys.argv)>4 else "annulus"
f=glob.glob(f"data/tesscut/**/tess-s{S:04d}*.fits",recursive=True)[0]
tpf=lk.read(f, quality_bitmask="none"); t=tpf.time.value; F=tpf.flux.value.astype(float); q=np.array(tpf.quality)
good=np.all(np.isfinite(F),axis=(1,2))&np.isfinite(t)&(q==0)
med0=np.nanmedian(F[good&(np.abs(t-TC)<1)],0)
xt,yt=[float(v) for v in tpf.wcs.world_to_pixel(SkyCoord(RA*u.deg,DEC*u.deg))]
Y,X=np.mgrid[:med0.shape[0],:med0.shape[1]]; rr=np.hypot(X-xt,Y-yt)
annzone=(rr>5)&(rr<9); ann=annzone&(med0<np.nanpercentile(med0[annzone],50))
if BK=="annulus": F=F-np.nanmedian(F[:,ann],axis=1)[:,None,None]
med=np.nanmedian(F[good&(np.abs(t-TC)<1)],0)
import os
INJ=float(os.environ.get("INJ","0"))   # inject a box transit of INJ ppt into the target's own light (median image within r<=2.5 px)
if INJ:
    star=np.where(rr<=2.5,np.clip(med,0,None),0.0)
    F=F-(INJ*1e-3)*((np.abs(t-TC)<DUR/2).astype(float))[:,None,None]*star[None]
    BK=BK+f"_inj{INJ:g}"
    print("injected",INJ,"ppt into",int((rr<=2.5).sum()),"px, star flux",round(float(star.sum()),1))
def boxmaps(tc):
    w=good&(np.abs(t-tc)<1.0); x=t[w]-tc
    s=(np.abs(x)<DUR/2).astype(float)
    if s.sum()<0.7*DUR/np.nanmedian(np.diff(t)) or (s==0).sum()<20: return None
    A=np.vstack([-s,np.ones_like(x),x,x**2]).T
    Yv=F[w].reshape(w.sum(),-1)
    c,*_=np.linalg.lstsq(A,Yv,rcond=None)
    return c[0].reshape(med.shape)
D=boxmaps(TC)
offs=np.r_[np.arange(-3,-0.5,0.08),np.arange(0.5,3,0.08)]
sl=[m for m in (boxmaps(TC+o) for o in offs) if m is not None]
sl=np.array(sl); E=1.4826*np.nanmedian(np.abs(sl-np.nanmedian(sl,0)),0)
print("slid maps:",len(sl))
# PSF from the median image around the target
def g2(p,X,Y): a,x0,y0,sg,b=p; return a*np.exp(-((X-x0)**2+(Y-y0)**2)/(2*sg**2))+b
m=rr<3.5
p=least_squares(lambda p:(g2(p,X[m],Y[m])-med[m]),[med[int(round(yt)),int(round(xt))],xt,yt,0.8,0]).x
sig=abs(p[3]); print("PSF fit: x0 %.2f y0 %.2f sigma %.2f px (WCS target %.2f %.2f)"%(p[1],p[2],sig,xt,yt))
def psf(x0,y0): 
    k=np.exp(-((X-x0)**2+(Y-y0)**2)/(2*sig**2)); return k/k.sum()
fitm=(rr<=6)&np.isfinite(D)&(E>0)
def fit(cols):
    A=np.vstack([c[fitm] for c in cols]).T/E[fitm][:,None]; b=D[fitm]/E[fitm]
    c,*_=np.linalg.lstsq(A,b,rcond=None); chi=np.sum((b-A@c)**2)
    cov=np.linalg.pinv(A.T@A); return c,np.sqrt(np.diag(cov)),chi
one=np.ones_like(D); px=X-xt; py=Y-yt
PT=psf(p[1],p[2])
res={}
for name,cols in [("plane",[one,px,py]),("psf_target+const",[PT,one]),("plane+psf_target",[one,px,py,PT]),("const",[one])]:
    c,e,chi=fit(cols); res[name]=dict(coef=[round(v,4) for v in c],err=[round(v,4) for v in e],chi2=round(chi,1),k=len(cols),bic=round(chi+len(cols)*np.log(fitm.sum()),1))
    print(name,res[name])
# Gaia neighbours
g=Table.read("data/gaia_2arcmin.csv")
nb=[]
for row in g[1:]:
    if not np.isfinite(row["phot_g_mean_mag"]) or row["phot_g_mean_mag"]>19.5: continue
    xn,yn=[float(v) for v in tpf.wcs.world_to_pixel(SkyCoord(row["ra"]*u.deg,row["dec"]*u.deg))]
    xn+=p[1]-xt; yn+=p[2]-yt
    if np.hypot(xn-p[1],yn-p[2])>4: continue
    c,e,chi=fit([one,px,py,psf(xn,yn)])
    # flux of the neighbour from G (scaled to target's PSF amplitude)
    ftar=p[0]*2*np.pi*sig**2; fn=ftar*10**(-0.4*(row["phot_g_mean_mag"]-g[0]["phot_g_mean_mag"]))
    nb.append(dict(source_id=int(row["source_id"]),G=round(float(row["phot_g_mean_mag"]),2),sep_arcsec=round(float(row["sep"]),1),px=[round(xn,2),round(yn,2)],
                   deficit_eps=round(c[3],2),err=round(e[3],2),chi2=round(chi,1),bic=round(chi+4*np.log(fitm.sum()),1),flux_eps=round(fn,1),
                   needed_eclipse_frac=round(c[3]/fn,2) if fn>0 else None))
    print("neighbour",nb[-1])
res["neighbours"]=nb
ct=res["plane+psf_target"]; ftar=p[0]*2*np.pi*sig**2
res["target_flux_eps_psf"]=round(ftar,1)
res["target_depth_from_psf_term_ppt"]=round(1e3*ct["coef"][3]/ftar,2); res["target_depth_err_ppt"]=round(1e3*ct["err"][3]/ftar,2)
res["deficit_map_sum_r6_eps"]=round(float(np.nansum(D[fitm])),1)
res["psf"]=dict(x0=round(p[1],2),y0=round(p[2],2),sigma=round(sig,2)); res["n_pix_fit"]=int(fitm.sum())
print("target depth from PSF term (plane+psf): %.2f +- %.2f ppt"%(res["target_depth_from_psf_term_ppt"],res["target_depth_err_ppt"]))
json.dump(res,open(f"data/step4_pixels_S{S}_{BK}.json","w"),indent=1)
fig,ax=plt.subplots(1,3,figsize=(15,4.6))
for a,img,ttl in [(ax[0],med,"median image"),(ax[1],D,"event deficit [e/s]"),(ax[2],D/E,"deficit / sigma")]:
    im=a.imshow(img,origin="lower",cmap="viridis" if a is ax[0] else "RdBu_r",vmin=None if a is ax[0] else -np.nanpercentile(np.abs(img),98),vmax=None if a is ax[0] else np.nanpercentile(np.abs(img),98))
    plt.colorbar(im,ax=a); a.plot(p[1],p[2],"k+",ms=12); a.set_title(f"S{S} {ttl}",fontsize=9)
    for n in nb: a.plot(*n["px"],"mx",ms=7)
fig.tight_layout(); fig.savefig(f"figs/step4_pixels_S{S}_{BK}.png",dpi=90)
