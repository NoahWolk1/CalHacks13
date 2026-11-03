"""Same-time dips on other stars: SPOC S5 2-min SAP of up to 15 nearby stars on camera 4 CCD 4."""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, json, lightkurve as lk
from astropy.io import fits
from measure import measure
RA,DEC=98.0332440439988,-68.1783294856264; TC,DUR=1456.295,0.15
sr=lk.search_lightcurve(f"{RA} {DEC}", radius=3600, author="SPOC", sector=5, exptime=120)
sr=sr[np.argsort(np.array(sr.table["distance"]))]; print("SPOC S5 2-min LCs within 1 deg:",len(sr))
rows=[]
for i in range(len(sr)):
    if len(rows)>=15: break
    tn=str(sr.table["target_name"][i])
    if tn=="167303776": continue
    try:
        lc=sr[i].download(download_dir="data/lc_neighbor"); h=fits.open(lc.meta.get("FILENAME") or lc.filename); d=h[1].data; hd=h[0].header
        if hd["CCD"]!=4 or hd["CAMERA"]!=4: continue
        t=np.array(d["TIME"],float); q=np.array(d["QUALITY"]); y=np.array(d["SAP_FLUX"],float); y[q!=0]=np.nan
        m=measure(t,y,TC,DUR,0.75,2)
        if m is None or not np.isfinite(m.get("depth",np.nan)): continue
        rows.append(dict(tic=tn,tmag=float(hd.get("TESSMAG",np.nan)),sep_arcmin=round(float(sr.table["distance"][i])/60,1),depth_ppt=round(m['depth']*1e3,2),sig=round(m['sig_adopt']*1e3,2)))
        print(rows[-1])
    except Exception as e: print("ERR",tn,e)
json.dump(rows,open("data/step3_neighbors.json","w"),indent=1)
