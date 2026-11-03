"""S39 TESScut: same box on other stars in the cutout (common-mode scattered-light test), and the depth of
star-free pixels in rings around the target (direct background-error measurement)."""
import warnings; warnings.filterwarnings("ignore")
import glob, json, numpy as np, lightkurve as lk
from scipy.ndimage import maximum_filter
from astropy.coordinates import SkyCoord; import astropy.units as u
from measure import measure, trapezoid
from common import RA, DEC, TC, DUR
tpf=lk.read(glob.glob("data/tesscut/tesscut/tess-s0039*.fits")[0])
t=tpf.time.value; F=tpf.flux.value.astype(float); fin=np.all(np.isfinite(F),axis=(1,2))
xt,yt=[float(v) for v in tpf.wcs.world_to_pixel(SkyCoord(RA*u.deg,DEC*u.deg))]
Y,X=np.mgrid[:F.shape[1],:F.shape[2]]; r=np.hypot(X-xt,Y-yt)
med=np.nanmedian(F[fin],0); faint=(med<np.nanpercentile(med,40))&(r>3)
bkg=np.nanmedian(F[:,faint],1); Fb=F-bkg[:,None,None]; medb=np.nanmedian(Fb[fin],0)
out={"comps":[]}
pk=(medb==maximum_filter(medb,size=5))&(medb>40)
for yy,xx in zip(*np.where(pk)):
    if np.hypot(xx-xt,yy-yt)<3 or xx<2 or yy<2 or xx>18 or yy>18: continue
    rr=np.hypot(X-xx,Y-yy)
    rec=dict(x=int(xx),y=int(yy),peak=round(float(medb[yy,xx]),1))
    for rap in [1.0,2.0]:
        lc=np.nansum(Fb[:,rr<=rap],1); m=measure(t[fin],lc[fin],TC,DUR,1.0)
        rec[f"r{rap}"]=(round(m['depth']*1e3,2),round(m['sig_adopt']*1e3,2))
        rec[f"r{rap}_deficit_e"]=round(m['depth']*np.median(lc[fin]),2)
    out["comps"].append(rec); print(rec)
# star-free pixel rings (faint pixels) depth in e/s/px, with the global faint background subtracted
w=(np.abs(t-TC)<1)&fin; tt=t[w]; s=trapezoid(tt,TC,DUR); A=np.vstack([-s,np.ones_like(tt),tt-TC,(tt-TC)**2]).T
dark=med<np.nanpercentile(med,50)
for lo,hi in [(1.5,3),(3,5),(5,8),(8,12)]:
    m_=dark&(r>=lo)&(r<hi)
    if m_.sum()<3: continue
    v=Fb[w][:,m_].mean(1); c,*_=np.linalg.lstsq(A,v,rcond=None); res=v-A@c
    e=np.sqrt(np.linalg.pinv(A.T@A)[0,0]*np.var(res))
    out[f"dark_ring_{lo}-{hi}"]=dict(npix=int(m_.sum()),deficit_e_per_px=round(float(c[0]),3),err=round(float(e),3)); print(lo,hi,out[f"dark_ring_{lo}-{hi}"])
# raw (no subtraction) background level change in faint pixels during event
v=bkg[w]; c,*_=np.linalg.lstsq(A,v,rcond=None); out["global_bkg_box_e_per_px"]=float(c[0])
# predicted aperture-growth if a flat over-subtraction delta per px is the only error, on a true depth d0
star={rap:float(np.nanmedian(np.nansum(Fb[fin][:,r<=rap],1))) for rap in [1.0,1.5,2.0,2.5,3.0]}
npx={rap:int((r<=rap).sum()) for rap in star}
ph=json.load(open("data/step2_own_phot.json"))["phot"]
obs={rap:ph[f"global faint-40%, r={rap}, q==0"]["depth"] for rap in star}
# fit obs_ppt = d0 + delta*npix/star*1e3
Am=np.array([[1,npx[k]/star[k]*1e3] for k in star]); b=np.array([obs[k] for k in star])
co,*_=np.linalg.lstsq(Am,b,rcond=None)
out["aperture_growth_model"]=dict(d0_ppt=float(co[0]),delta_e_per_px=float(co[1]),obs=obs,pred={k:float(Am[i]@co) for i,k in enumerate(star)},star_e=star,npix=npx)
print(out["aperture_growth_model"])
json.dump(out,open("data/step3_comps.json","w"),indent=1)
