"""Same-time dips/humps on other stars: QLP S65 light curves of up to 15 stars within 0.5 deg on camera 4 CCD 3."""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, json, lightkurve as lk
from astropy.io import fits
from measure import measure
TC=3084.74
sr=lk.search_lightcurve("86.01301 -60.84790", radius=1800, author="QLP", sector=65)
sr=sr[np.argsort(np.array(sr.table["distance"]))]
print("QLP S65 LCs within 0.5 deg:",len(sr))
rows=[]
for i in range(len(sr)):
    if len(rows)>=15: break
    tn=str(sr.table["target_name"][i])
    if tn=="149538842": continue
    try:
        lc=sr[i].download(download_dir="data/lc_neighbor"); f=lc.meta.get("FILENAME") or lc.filename
        h=fits.open(f); d=h[1].data; hd=h[0].header
        if hd["CCD"]!=3 or hd["CAMERA"]!=4: continue
        t=np.array(d["TIME"],float); q=np.array(d["QUALITY"]); 
        res=dict(tic=tn,tmag=float(hd.get("TESSMAG",np.nan)),sep_arcmin=round(float(sr.table["distance"][i])/60,1))
        for c in ["SAP_FLUX","DET_FLUX"]:
            y=np.array(d[c],float); y[q!=0]=np.nan
            m=measure(t,y,TC,0.25,1.0,2)
            res[c]=(round(m['depth']*1e3,2),round(m['sig_adopt']*1e3,2))
            # hump statistic at the flare time (negative depth = brightening)
            m2=measure(t,y,3084.50,0.25,1.0,2); res[c+"_at_flare"]=(round(m2['depth']*1e3,2),round(m2['sig_adopt']*1e3,2))
        rows.append(res); print(res)
    except Exception as e: print("ERR",tn,e)
json.dump(rows,open("data/step3_neighbors.json","w"),indent=1)
d=np.array([r["DET_FLUX"][0]/r["DET_FLUX"][1] for r in rows]); print("N",len(rows),"median DET depth/sig",np.median(d),"n>3sig",(d>3).sum())
