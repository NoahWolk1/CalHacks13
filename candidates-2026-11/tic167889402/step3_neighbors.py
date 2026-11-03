"""Same-time dips on other stars: bright TIC stars within 3 deg with S96 SPOC 2-min LCs on the same camera/CCD;
8h-box depth at TC in SAP and PDCSAP (quadratic baseline, +-1 d)."""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, json, os, lightkurve as lk
from astropy.io import fits
from astroquery.mast import Catalogs
from measure import measure
from common import RA, DEC, TC, DUR, TIC
os.makedirs("data/lc_neighbor",exist_ok=True)
tic=Catalogs.query_criteria(coordinates=f"{RA} {DEC}",radius=3.0,catalog="TIC",Tmag=[6.5,10.0],objType="STAR")
tic.sort("Tmag"); ids=[str(x) for x in tic["ID"] if str(x)!=str(TIC)][:60]
print("candidate neighbours",len(ids),flush=True)
out=[]
for tid in ids:
    if len(out)>=12: break
    try: sr=lk.search_lightcurve(f"TIC {tid}",author="SPOC",exptime=120,sector=96)
    except Exception as e: print("fail",tid,e); continue
    if len(sr)==0: continue
    try: f=sr[0].download(download_dir="data/lc_neighbor",flux_column="sap_flux").meta["FILENAME"]
    except Exception as e: print("dl fail",e); continue
    h=fits.open(f); d=h[1].data; hd=h[0].header
    if (hd["CAMERA"],hd["CCD"])!=(4,3): print("other ccd",tid); continue
    t=np.array(d["TIME"],float); q=np.array(d["QUALITY"])
    rec=dict(tic=tid,tmag=hd.get("TESSMAG"),cam=hd["CAMERA"],ccd=hd["CCD"])
    for c in ["SAP_FLUX","PDCSAP_FLUX"]:
        y=np.array(d[c],float); y[q!=0]=np.nan; g=np.isfinite(y)&np.isfinite(t)
        m=measure(t[g],y[g],TC,DUR,win=1.0,order=2)
        rec[c]=None if (m is None or not np.isfinite(m.get("depth",np.nan))) else [round(m["depth"]*1e3,3),round(m["sig_adopt"]*1e3,3),round(m["frac_deeper"],3)]
    out.append(rec); print(rec,flush=True)
json.dump(out,open("data/step3_neighbors.json","w"),indent=1)
d=np.array([r["PDCSAP_FLUX"][0] for r in out if r["PDCSAP_FLUX"]]); s=np.array([r["SAP_FLUX"][0] for r in out if r["SAP_FLUX"]])
print("median PDCSAP depth %.3f, SAP %.3f ppt (N=%d)"%(np.median(d),np.median(s),len(d)))
