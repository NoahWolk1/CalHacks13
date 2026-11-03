"""Same-time test on other stars: QLP light curves of nearby TIC stars (same camera/CCD) in the event sector,
depth in the same box, plus QLP's background for each. Usage: step3_neighbors.py SECTOR TC DUR_H RADIUS_DEG NMAX"""
import warnings, json, sys, os; warnings.filterwarnings("ignore")
import numpy as np, lightkurve as lk
from astroquery.mast import Catalogs
from astropy.io import fits
from measure import measure
from common import RA, DEC, TIC
S=int(sys.argv[1]); TC=float(sys.argv[2]); DUR=float(sys.argv[3])/24; RAD=float(sys.argv[4]); NMAX=int(sys.argv[5])
cat=Catalogs.query_region(f"{RA} {DEC}",radius=RAD,catalog="TIC")
cat=cat[(cat["Tmag"]>10)&(cat["Tmag"]<13.5)&(cat["objType"]=="STAR")&(cat["ID"]!=TIC)]
cat.sort("dstArcSec"); print(len(cat),"candidates")
os.makedirs("data/neighbors",exist_ok=True)
out=[]
for row in cat:
    if len(out)>=NMAX: break
    try:
        sr=lk.search_lightcurve(f"TIC {row['ID']}",author="QLP",sector=S)
        if len(sr)==0: continue
        lc=sr[0].download(download_dir="data/neighbors",flux_column="sap_flux")
        h=fits.open(lc.meta["FILENAME"]); D=h[1].data; t=D["TIME"]; q=D["QUALITY"]; y=np.array(D["SAP_FLUX"],float); y[q!=0]=np.nan
        r=measure(t,y,TC,DUR)
        if r is None or not np.isfinite(r.get("depth",np.nan)): continue
        b=np.array(D["SAP_BKG"],float); w=np.abs(t-TC)<DUR/2
        o=dict(tic=int(row["ID"]),Tmag=round(float(row["Tmag"]),2),sep_deg=round(float(row["dstArcSec"])/3600,3),cam=h[0].header["CAMERA"],ccd=h[0].header["CCD"],
               depth_ppt=round(r["depth"]*1e3,2),sig=round(r["sig_adopt"]*1e3,2),snr=round(r["depth"]/r["sig_adopt"],1),bkg_range_in_box=round(float(np.nanmax(b[w])-np.nanmin(b[w])),1))
        out.append(o); print(o,flush=True)
    except Exception as e: print("ERR",row["ID"],str(e)[:100])
d=np.array([o["depth_ppt"] for o in out]); s=np.array([o["sig"] for o in out])
summ=dict(n=len(out),median_depth=round(float(np.median(d)),2),n_pos_2sig=int((d/s>2).sum()),n_neg_2sig=int((d/s<-2).sum()),weighted_mean=round(float(np.sum(d/s**2)/np.sum(1/s**2)),2),wm_err=round(float(1/np.sqrt(np.sum(1/s**2))),2))
print(summ)
json.dump(dict(stars=out,summary=summ),open(f"data/step3_neighbors_S{S}.json","w"),indent=1)
