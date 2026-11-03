"""(Earlier run, output in data/step3_neighbors_spoc_sameccd.txt) Same-time features on 20 other TESS-SPOC S32 SAP light curves on camera 4 CCD 2 within 1 deg."""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, lightkurve as lk
from astropy.io import fits
from measure import trapezoid
from common import *
TS=2190.358
def fit(t,y):
    w=np.isfinite(y)&(np.abs(t-TC)<1.0); x=t[w]-TC; f=y[w]/np.median(y[w]); S=(t[w]>TS).astype(float); D=-trapezoid(t[w],TC,DUR)
    M1=np.vstack([np.ones_like(x),x,S,D]).T; c1=np.linalg.lstsq(M1,f,rcond=None)[0]; s=np.std(f-M1@c1)/np.sqrt(max((D<-0.5).sum(),1))
    M0=np.vstack([np.ones_like(x),x,x**2,D]).T; c0=np.linalg.lstsq(M0,f,rcond=None)[0]
    return dict(step_ppt=round(c1[2]*1e3,2),dip_with_step=round(c1[3]*1e3,2),dip_no_step=round(c0[3]*1e3,2),sig_white=round(s*1e3,2))
sr=lk.search_lightcurve(f"{RA} {DEC}", radius=3600, author="TESS-SPOC", sector=32); sr=sr[np.argsort(np.array(sr.table["distance"]))]
print("TESS-SPOC S32 LCs within 1 deg:",len(sr)); rows=[]
for i in range(len(sr)):
    if len(rows)>=20: break
    tn=str(sr.table["target_name"][i])
    if tn==str(TIC): continue
    lc=sr[i].download(download_dir="data/lc_neighbor"); f=lc.meta.get("FILENAME") or lc.filename; h=fits.open(f); d=h[1].data; hd=h[0].header
    if hd["CCD"]!=2 or hd["CAMERA"]!=4: continue
    t=np.array(d["TIME"],float); q=np.array(d["QUALITY"]); y=np.array(d["SAP_FLUX"],float); y[q!=0]=np.nan
    rr=fit(t,y); rr.update(tic=tn,tmag=float(hd.get("TESSMAG",np.nan)),sep_arcmin=round(float(sr.table["distance"][i])/60,1)); rows.append(rr); print(rr)
S=np.array([r["step_ppt"] for r in rows]); Dn=np.array([r["dip_no_step"]/r["sig_white"] for r in rows])
print(dict(n=len(S),median_abs_step_ppt=float(np.median(np.abs(S))),max_abs_step_ppt=float(np.max(np.abs(S))),n_dip_no_step_gt3sig=int((Dn>3).sum())))
