"""Same-time dips on other stars: QLP light curves of up to 25 stars within 1 deg on the same camera/CCD. usage: SECTOR TC"""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, json, sys, lightkurve as lk
from astropy.io import fits
from measure import measure
from cfg import *
S=int(sys.argv[1]); tc=float(sys.argv[2]); CCD=int(sys.argv[3])
sr=lk.search_lightcurve(f"{RA} {DEC}", radius=3600, author="QLP", sector=S)
sr=sr[np.argsort(np.array(sr.table["distance"]))]
print("QLP LCs within 1 deg:",len(sr))
rows=[]
for i in range(len(sr)):
    if len(rows)>=25: break
    tn=str(sr.table["target_name"][i])
    if tn==str(TIC): continue
    try:
        lc=sr[i].download(download_dir="data/lc_neighbor"); f=lc.meta.get("FILENAME") or lc.filename
        h=fits.open(f); d=h[1].data; hd=h[0].header
        if hd["CCD"]!=CCD: continue
        t=np.array(d["TIME"],float); q=np.array(d["QUALITY"])
        res={}
        for c in ["SAP_FLUX","DET_FLUX" if "DET_FLUX" in d.columns.names else "KSPSAP_FLUX"]:
            y=np.array(d[c],float); y[q!=0]=np.nan; m=measure(t,y,tc,DUR,1.0,2)
            res[c]=None if (m is None or not np.isfinite(m.get("depth",np.nan))) else (round(m["depth"]*1e3,2),round(m["sig_adopt"]*1e3,2))
        rows.append(dict(tic=tn,tmag=float(hd.get("TESSMAG",np.nan)),sep_deg=round(float(sr.table["distance"][i])/3600,3),**res)); print(rows[-1])
    except Exception as e: print("ERR",tn,str(e)[:80])
z=np.array([r["SAP_FLUX"][0]/r["SAP_FLUX"][1] for r in rows if r["SAP_FLUX"]]); k=[k for k in rows[0] if k not in ("tic","tmag","sep_deg","SAP_FLUX")][0]
z2=np.array([r[k][0]/r[k][1] for r in rows if r[k]])
print(f"N={len(z)}: SAP depth/sigma median {np.median(z):.2f}, n>3 {np.sum(z>3)}; {k} median {np.median(z2):.2f}, n>3 {np.sum(z2>3)}")
json.dump(dict(rows=rows,sap_z_median=float(np.median(z)),sap_n_gt3=int(np.sum(z>3)),det_z_median=float(np.median(z2)),det_n_gt3=int(np.sum(z2>3))),open(f"data/step3_neighbors_s{S}.json","w"),indent=1)
