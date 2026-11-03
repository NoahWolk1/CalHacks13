"""(a) Same-time features on other stars: a 41x41 px S32 TESScut (14'x14'): 15 brightest isolated stars, line+step(2190.358)+dip fits;
plus a scan of every pixel for an abrupt step at 2190.358 (is the one-pixel step unique?).
(b) The two neighbours that could matter (TIC 382069792, T 14.0 at 70"; TIC 382069803, T 15.4 at 75"): their own pipeline products,
own S32 photometry on their pixels."""
import warnings; warnings.filterwarnings("ignore")
import glob, numpy as np, json, lightkurve as lk, os
from astropy.table import Table
from astroquery.mast import Catalogs
from astropy.coordinates import SkyCoord; import astropy.units as u
from measure import trapezoid
from common import *
TS=2190.358
def fit(t,y):
    w=np.isfinite(y)&(np.abs(t-TC)<1.0); x=t[w]-TC; f=y[w]/np.median(y[w]); S=(t[w]>TS).astype(float); D=-trapezoid(t[w],TC,DUR)
    M1=np.vstack([np.ones_like(x),x,S,D]).T; c1=np.linalg.lstsq(M1,f,rcond=None)[0]; s=np.std(f-M1@c1)/np.sqrt(max((D<-0.5).sum(),1))
    M0=np.vstack([np.ones_like(x),x,x**2,D]).T; c0=np.linalg.lstsq(M0,f,rcond=None)[0]
    return dict(step_ppt=round(c1[2]*1e3,2),dip_with_step=round(c1[3]*1e3,2),dip_no_step=round(c0[3]*1e3,2),sig_white=round(s*1e3,2))
out={}
os.makedirs("data/tesscut_big",exist_ok=True)
f=glob.glob("data/tesscut_big/**/tess-s0032*.fits",recursive=True)
tp=lk.read(f[0]) if f else lk.search_tesscut(f"TIC {TIC}",sector=32).download(cutout_size=41,download_dir="data/tesscut_big")
t=tp.time.value; F=tp.flux.value.astype(float); ok=np.all(np.isfinite(F),axis=(1,2))&(tp.quality==0); t=t[ok]; F=F[ok]
w=np.abs(t-TC)<1.0; med=np.median(F,0); bkg=np.median(F[:,med<np.percentile(med,30)],1); Fb=F-bkg[:,None,None]
# (a1) per-pixel step scan
x=t[w]-TC; S=(t[w]>TS).astype(float); M=np.vstack([np.ones_like(x),x,S]).T; P=np.linalg.pinv(M)
st=np.einsum('kt,tyx->kyx',P,Fb[w])[2]; res=Fb[w]-np.einsum('tk,kyx->tyx',M,np.einsum('kt,tyx->kyx',P,Fb[w]))
est=np.sqrt(np.linalg.pinv(M.T@M)[2,2]*res.var(0)); z=st/est
xt,yt=[float(v) for v in tp.wcs.world_to_pixel_values(RA,DEC)]
big=np.argwhere(np.abs(z)>8)
out["pixel_step_scan"]=dict(npix=int(z.size),n_absz_gt8=len(big),pixels=[dict(x=int(i),y=int(j),step_e_s=round(float(st[j,i]),2),z=round(float(z[j,i]),1),flux=round(float(med[j,i]),1),dist_from_target_px=round(float(np.hypot(i-xt,j-yt)),2)) for j,i in big])
print("pixel step scan:",out["pixel_step_scan"])
# (a2) stars in the cutout
tic=Catalogs.query_region(SkyCoord(RA,DEC,unit="deg"),radius=0.12*u.deg,catalog="TIC"); tic=tic[(tic["Tmag"]<13.5)]; tic.sort("Tmag")
Y,X=np.mgrid[:F.shape[1],:F.shape[2]]; rows=[]
for s in tic:
    if int(s["ID"])==TIC: continue
    px,py=[float(v) for v in tp.wcs.world_to_pixel_values(s["ra"],s["dec"])]
    if not(3<px<F.shape[2]-4 and 3<py<F.shape[1]-4): continue
    ap=np.hypot(X-px,Y-py)<=1.5; lc=Fb[:,ap].sum(1); rr=fit(t,lc); rr.update(tic=str(s["ID"]),tmag=round(float(s["Tmag"]),2),sep_arcmin=round(float(s["dstArcSec"])/60,1)); rows.append(rr); print(rr)
    if len(rows)>=15: break
out["cutout_stars"]=rows
dn=np.array([r["dip_no_step"]/r["sig_white"] for r in rows]); ds=np.array([r["dip_with_step"]/r["sig_white"] for r in rows]); stp=np.array([r["step_ppt"] for r in rows])
out["cutout_summary"]=dict(n=len(rows),median_abs_step_ppt=float(np.median(np.abs(stp))),max_abs_step_ppt=float(np.max(np.abs(stp))),n_dip_no_step_gt3sig=int((dn>3).sum()),n_dip_with_step_gt3sig=int((ds>3).sum()))
print(out["cutout_summary"])
# (b)
g=Table.read("data/gaia_2arcmin.csv"); gx,gy=tp.wcs.world_to_pixel_values(np.array(g["ra"]),np.array(g["dec"]))
for sid,tid,lab in [(4762785892774935936,382069792,"TIC 382069792 (T14.0, 70\")"),(4762785720976245120,382069803,"TIC 382069803 (T15.4, 75\")")]:
    i=int(np.where(g["source_id"]==sid)[0][0])
    for rap in [1.0,1.5]:
        ap=np.hypot(X-gx[i],Y-gy[i])<=rap; rr=fit(t,Fb[:,ap].sum(1)); rr["npix"]=int(ap.sum()); out[f"{lab} own S32 r={rap}"]=rr; print(lab,rap,rr)
    try:
        s2=lk.search_lightcurve(f"TIC {tid}"); out[f"{lab} products"]=sorted(set(f"{a} S{int(n)}" for a,n in zip(s2.table["author"],s2.table["sequence_number"]))) if len(s2) else []
    except Exception as e: out[f"{lab} products"]=f"ERR {e}"
    print(lab,"products:",out[f"{lab} products"])
json.dump(out,open("data/step3_neighbors.json","w"),indent=1,default=str)
