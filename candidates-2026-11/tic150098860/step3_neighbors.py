"""Same-time dips on other stars: bright TIC stars within 2 deg with S4 SPOC 2-min LCs; raw SAP/PDCSAP 8h-box depth at 1417.097 and post-dump jitter ratio."""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, json, os, lightkurve as lk
from astropy.io import fits
from astroquery.mast import Catalogs
from measure import measure
from common import RA, DEC
os.makedirs("data/lc_neighbor",exist_ok=True)
tic=Catalogs.query_criteria(coordinates=f"{RA} {DEC}",radius=2.0,catalog="TIC",Tmag=[7.0,10.5],objType="STAR")
tic.sort("Tmag"); ids=[str(x) for x in tic["ID"] if str(x)!="150098860"][:50]
print("candidate neighbours",len(ids),flush=True)
out=[]
for tid in ids:
    if len(out)>=15: break
    try: sr=lk.search_lightcurve(f"TIC {tid}",author="SPOC",exptime=120,sector=4)
    except Exception as e: print("fail",tid,e); continue
    if len(sr)==0: continue
    try: f=sr[0].download(download_dir="data/lc_neighbor",flux_column="sap_flux").meta["FILENAME"]
    except Exception as e: print("dl fail",e); continue
    h=fits.open(f); d=h[1].data; hd=h[0].header
    t=np.array(d["TIME"],float); q=np.array(d["QUALITY"])
    rec=dict(tic=tid,tmag=hd.get("TESSMAG"),cam=hd["CAMERA"],ccd=hd["CCD"])
    for c in ["SAP_FLUX","PDCSAP_FLUX"]:
        y=np.array(d[c],float); y[q!=0]=np.nan
        m=measure(t,y,1417.097,0.333,win=1.0,order=2)
        rec[c]=None if (m is None or not np.isfinite(m.get("depth",np.nan))) else [round(m["depth"]*1e3,2),round(m["sig_adopt"]*1e3,2),round(m["frac_deeper"],3)]
    c1=np.array(d['MOM_CENTR1'],float); c2=np.array(d['MOM_CENTR2'],float)
    pre=(t>1416.5)&(t<1416.93); post=(t>1416.95)&(t<1417.3)
    rec['jitter_post_over_pre']=round(float(np.hypot(np.nanstd(c1[post]),np.nanstd(c2[post]))/np.hypot(np.nanstd(c1[pre]),np.nanstd(c2[pre]))),2)
    out.append(rec); print(rec,flush=True)
json.dump(out,open("data/step3_neighbors.json","w"),indent=1)
