"""Same-time dips on other stars: TESS-SPOC S65 SAP light curves of up to 20 nearby stars on camera 4 CCD 2."""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, json, lightkurve as lk
from astropy.io import fits
from measure import measure
from common import *
sr=lk.search_lightcurve(f"{RA} {DEC}", radius=2700, author="TESS-SPOC", sector=65)
tab=sr.table; sr=sr[np.argsort(np.array(tab["distance"]))]
print("TESS-SPOC S65 LCs within 0.75 deg:",len(sr))
rows=[]
for i in range(len(sr)):
    if len(rows)>=20: break
    tn=str(sr.table["target_name"][i])
    if tn=="177239679": continue
    try:
        lc=sr[i].download(download_dir="data/lc_neighbor"); f=lc.meta.get("FILENAME") or lc.filename
        h=fits.open(f); d=h[1].data; hd=h[0].header
        if hd["CCD"]!=2 or hd["CAMERA"]!=4: continue
        t=np.array(d["TIME"],float); q=np.array(d["QUALITY"]); y=np.array(d["SAP_FLUX"],float); y[q!=0]=np.nan
        m=measure(t,y,TC1,DUR,1.0,2)
        if m is None or not np.isfinite(m.get("depth",np.nan)): continue
        rows.append(dict(tic=tn,tmag=float(hd.get("TESSMAG",np.nan)),sep_arcmin=round(float(sr.table["distance"][i])/60,1),depth=round(m['depth']*1e3,2),sig=round(m['sig_adopt']*1e3,2),fdeeper=round(m["frac_deeper"],3)))
        print(rows[-1])
    except Exception as e: print("ERR",tn,e)
d=np.array([r["depth"]/r["sig"] for r in rows]); print("N",len(rows),"median depth/sig",np.median(d),"n>3sig",(d>3).sum(),"median depth",np.median([r['depth'] for r in rows]))
json.dump(rows,open("data/step3_neighbors.json","w"),indent=1)
