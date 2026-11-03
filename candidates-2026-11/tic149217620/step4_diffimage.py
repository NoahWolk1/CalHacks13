"""Per-pixel depth image (box + local quadratic per pixel, +-1 d) and a linear fit of that image with a Gaussian PSF placed
on each Gaia star brighter than G=19 within 3 px, giving each star's implied eclipse depth. usage: SECTOR TC"""
import warnings; warnings.filterwarnings("ignore")
import glob, json, sys, numpy as np, lightkurve as lk
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
from astropy.table import Table
from measure import trapezoid
from cfg import *
S=int(sys.argv[1]); tc=float(sys.argv[2])
tpf=lk.read(glob.glob(f"data/tesscut/**/tess-s{S:04d}*.fits",recursive=True)[0])
t=tpf.time.value; F=tpf.flux.value.astype(float); q=tpf.quality
good=np.all(np.isfinite(F),axis=(1,2))&(q==0); t=t[good]; F=F[good]
med=np.nanmedian(F,0); onsi=med>1; ny,nx=med.shape; Y,X=np.mgrid[:ny,:nx]
xt,yt=[float(v) for v in tpf.wcs.world_to_pixel_values(RA,DEC)]
faint=onsi&(med<np.nanpercentile(med[onsi],30))&(np.hypot(X-xt,Y-yt)>3); bkg=np.nanmedian(F[:,faint],1); Fb=F-bkg[:,None,None]
w=np.abs(t-tc)<1.0; tt=t[w]; s=trapezoid(tt,tc,DUR)
A=np.vstack([-s,np.ones_like(tt),tt-tc,(tt-tc)**2]).T; P=np.linalg.pinv(A.T@A)
D=np.full((ny,nx),np.nan); E=np.full((ny,nx),np.nan)
for yy in range(ny):
    for xx in range(nx):
        if not onsi[yy,xx]: continue
        v=Fb[w,yy,xx]; c=np.linalg.lstsq(A,v,rcond=None)[0]; D[yy,xx]=c[0]; E[yy,xx]=np.sqrt(P[0,0])*np.std(v-A@c)
g=Table.read("data/gaia_2arcmin.csv"); gx,gy=tpf.wcs.world_to_pixel_values(np.array(g["ra"]),np.array(g["dec"]))
G=np.array(g["phot_g_mean_mag"]); sep=np.array(g["sep"])
# PSF width from the median image of the target
mb=np.nanmedian(Fb,0)
def psf(x0,y0,sig): return np.exp(-((X-x0)**2+(Y-y0)**2)/(2*sig**2))
best=None
for sig in np.arange(0.5,1.6,0.05):
    sel=(G<18)&(np.abs(gx-xt)<6)&(np.abs(gy-yt)<6)
    M=np.vstack([psf(gx[i],gy[i],sig)[onsi] for i in np.where(sel)[0]]+[np.ones(onsi.sum())]).T
    c=np.linalg.lstsq(M,mb[onsi],rcond=None)[0]; chi=np.sum((mb[onsi]-M@c)**2)
    if best is None or chi<best[0]: best=(chi,sig)
sig=best[1]; print("PSF sigma px",round(sig,2))
near=np.where((G<19)&(np.hypot(gx-xt,gy-yt)<3.5))[0]
fitm=onsi&(np.hypot(X-xt,Y-yt)<4.5)&np.isfinite(D)
M=np.vstack([psf(gx[i],gy[i],sig)[fitm] for i in near]).T
Wt=1/E[fitm]
res={}
# single-source fits: for each star alone, chi2 of D = a*PSF_i
for i in near:
    m=psf(gx[i],gy[i],sig)[fitm]; a=np.sum(m*D[fitm]*Wt**2)/np.sum(m*m*Wt**2); ea=1/np.sqrt(np.sum(m*m*Wt**2))
    chi=np.sum(((D[fitm]-a*m)*Wt)**2)
    flux_star=10**(-0.4*(G[i]-G[0]))*np.nansum(mb[np.hypot(X-xt,Y-yt)<3])  # crude: scale by G-band flux ratio
    res[str(g["source_id"][i])]=dict(G=round(float(G[i]),2),sep=round(float(sep[i]),1),amp_e=round(a,2),amp_err=round(ea,2),snr=round(a/ea,1),chi2=round(chi,1),
         implied_eclipse_depth=round(a/(10**(-0.4*(G[i]-G[0]))*mb[fitm].sum()/np.sum(psf(gx[0],gy[0],sig)[fitm])/ (2*np.pi*sig**2) * (2*np.pi*sig**2)),4) if True else None)
chi_none=np.sum((D[fitm]*Wt)**2)
for k,v in sorted(res.items(),key=lambda kv:kv[1]["chi2"]): print(k,v)
print("chi2 for no signal:",round(chi_none,1),"n pix",fitm.sum())
ap=np.hypot(X-xt,Y-yt)<=1.5
out=dict(sector=S,tc=tc,psf_sigma=float(sig),single_source_fits=res,chi2_null=float(chi_none),npix=int(fitm.sum()),
         target_px_snr=float(D[int(round(yt)),int(round(xt))]/E[int(round(yt)),int(round(xt))]),
         r1p5_depth_ppt=float(np.nansum(D[ap])/np.nansum(mb[ap])*1e3))
# depth-weighted centroid of positive D within 3 px
mm=(np.hypot(X-xt,Y-yt)<3)&(D>0)&np.isfinite(D); cx=(D[mm]*X[mm]).sum()/D[mm].sum(); cy=(D[mm]*Y[mm]).sum()/D[mm].sum()
out["depth_centroid_px"]=[float(cx),float(cy)]; out["target_px"]=[xt,yt]; out["depth_centroid_offset_arcsec"]=float(np.hypot(cx-xt,cy-yt)*21)
print("target px snr",out["target_px_snr"],"r1.5 depth",out["r1p5_depth_ppt"],"depth centroid offset",out["depth_centroid_offset_arcsec"],"arcsec")
json.dump(out,open(f"data/step4_diffimage_s{S}.json","w"),indent=1,default=float)
fig,ax=plt.subplots(1,3,figsize=(16,5))
for a,img,ttl in zip(ax,[np.log10(np.clip(mb,1,None)),D,D/E],["median (log e/s)",f"per-pixel depth (e/s), box at {tc}","per-pixel depth SNR"]):
    vm=None if a is ax[0] else np.nanpercentile(np.abs(img[np.hypot(X-xt,Y-yt)<5]),98)
    im=a.imshow(img,origin="lower",cmap="viridis" if a is ax[0] else "RdBu_r",vmin=None if vm is None else -vm,vmax=vm); plt.colorbar(im,ax=a,fraction=.046); a.set_title(ttl,fontsize=9)
    b=G<19; a.scatter(gx[b],gy[b],s=np.clip((20-G[b])*10,5,200),facecolors='none',edgecolors='k',lw=.7)
    for i in near: a.text(gx[i]+.2,gy[i]+.2,f"{G[i]:.1f}",fontsize=6)
    a.plot(xt,yt,'r+',ms=12,mew=2); a.set_xlim(xt-5.5,xt+5.5); a.set_ylim(yt-5.5,yt+5.5)
plt.tight_layout(); plt.savefig(f"figs/diffimage_s{S}.png",dpi=90)
# point source vs diffuse: fit D (within 4.5 px) with nested models
def wls(cols):
    M=np.vstack([c[fitm] for c in cols]).T*Wt[:,None]; c=np.linalg.lstsq(M,D[fitm]*Wt,rcond=None)[0]
    cov=np.linalg.pinv(M.T@M); return c,np.sqrt(np.diag(cov)),float(np.sum((D[fitm]*Wt-M@c)**2))
ones=np.ones_like(D); pt=psf(xt,yt,sig); ib=int(np.argmin(np.abs(sep-41.7))); pn=psf(gx[ib],gy[ib],sig)
models={"constant":[ones],"plane":[ones,X-xt,Y-yt],"target":[pt],"neighbour G16.3":[pn],"constant+target":[ones,pt],"constant+neighbour":[ones,pn],
        "plane+neighbour":[ones,X-xt,Y-yt,pn],"plane+target":[ones,X-xt,Y-yt,pt]}
mf={}
for k,cols in models.items():
    c,e,chi=wls(cols); mf[k]=dict(coef=[round(x,3) for x in c],err=[round(x,3) for x in e],chi2=round(chi,1),k=len(cols),bic=round(chi+len(cols)*np.log(fitm.sum()),1))
    print(f"{k:22s} chi2 {chi:7.1f} BIC {mf[k]['bic']:7.1f} coef {mf[k]['coef']} ± {mf[k]['err']}")
print("null chi2",round(chi_none,1))
out["model_fits"]=mf; out["chi2_null"]=float(chi_none)
# positive-pixel fraction outside 2 px from target and from the neighbour
far=fitm&(np.hypot(X-xt,Y-yt)>2)&(np.hypot(X-gx[ib],Y-gy[ib])>2)
out["far_pixels_mean_depth_e"]=float(np.nanmean(D[far])); out["far_pixels_mean_snr"]=float(np.nanmean(D[far]/E[far])*np.sqrt(far.sum()))
print("pixels >2 px from both stars: mean depth",out["far_pixels_mean_depth_e"],"e/s/px, combined SNR",out["far_pixels_mean_snr"],"N",far.sum())
json.dump(out,open(f"data/step4_diffimage_s{S}.json","w"),indent=1,default=float)
# joint fit and conversion to fractional depths using PSF-fit fluxes of the median image
c,e,chi=wls([ones,X-xt,Y-yt,pt,pn]); print("plane+target+neighbour: target amp",round(c[3],3),"±",round(e[3],3),"neighbour amp",round(c[4],3),"±",round(e[4],3),"chi2",round(chi,1))
sel=np.where((G<19)&(np.abs(gx-xt)<6)&(np.abs(gy-yt)<6))[0]
M=np.vstack([psf(gx[i],gy[i],sig)[onsi] for i in sel]+[np.ones(onsi.sum())]).T; cm=np.linalg.lstsq(M,mb[onsi],rcond=None)[0]
ft=cm[list(sel).index(0)]; fn=cm[list(sel).index(ib)]
print("median-image PSF amplitudes: target",round(ft,1),"neighbour",round(fn,1),"ratio",round(fn/ft,3),"(TIC T-mag ratio 10^(-0.4*(15.21-13.38)) =",round(10**(-0.4*(15.2065-13.3778)),3),")")
print("implied depth if on target:",round(c[3]/ft*1e3,2),"±",round(e[3]/ft*1e3,2),"ppt; if on neighbour:",round(c[4]/fn*100,2),"±",round(e[4]/fn*100,2),"%")
out["joint"]=dict(target_amp=float(c[3]),target_err=float(e[3]),nb_amp=float(c[4]),nb_err=float(e[4]),chi2=chi,f_target=float(ft),f_nb=float(fn),
   depth_target_ppt=float(c[3]/ft*1e3),depth_target_err=float(e[3]/ft*1e3),depth_nb_pct=float(c[4]/fn*100),depth_nb_err_pct=float(e[4]/fn*100))
for k in ["neighbour G16.3","plane+neighbour","constant+neighbour"]:
    out["model_fits"][k]["nb_depth_pct"]=round(out["model_fits"][k]["coef"][-1]/fn*100,2)
json.dump(out,open(f"data/step4_diffimage_s{S}.json","w"),indent=1,default=float)
