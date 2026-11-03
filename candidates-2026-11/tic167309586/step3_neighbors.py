"""Same-time dips on other stars: bright TIC stars within 2 deg; SPOC 2-min (S4,S37,S90) or TESS-SPOC FFI (S37,S67) LCs."""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, json, os, sys, lightkurve as lk
from astropy.io import fits
from astroquery.mast import Catalogs
from measure import measure
from common import EV, DUR, RA, DEC
os.makedirs("data/lc_neighbor",exist_ok=True)
tic=Catalogs.query_criteria(coordinates=f"{RA} {DEC}",radius=2.0,catalog="TIC",Tmag=[7.5,10.5],objType="STAR")
tic.sort("Tmag"); ids=[str(x) for x in tic["ID"] if str(x)!="167309586"][:60]
print("candidate neighbours",len(ids),flush=True)
out=[]; count={}
for tid in ids:
    try: sr=lk.search_lightcurve(f"TIC {tid}",author=["SPOC","TESS-SPOC"])
    except Exception as e: print("fail",tid,e); continue
    for s,tc in EV.items():
        for author,exp in ([("SPOC",120),("TESS-SPOC",None)] if s==37 else [("SPOC",120)] if s in (4,90) else [("TESS-SPOC",None)]):
            if count.get((s,author),0)>=10: continue
            m_=[i for i in range(len(sr)) if sr.table["sequence_number"][i]==s and sr.table["author"][i]==author and (exp is None or sr.table["exptime"][i]==exp)]
            if not m_: continue
            try: f=sr[m_[0]].download(download_dir="data/lc_neighbor",flux_column="sap_flux").meta["FILENAME"]
            except Exception as e: print("dl fail",e); continue
            h=fits.open(f); d=h[1].data; hd=h[0].header
            t=np.array(d["TIME"],float); q=np.array(d["QUALITY"])
            rec=dict(sector=s,author=author,tic=tid,tmag=hd.get("TESSMAG"),cam=hd["CAMERA"],ccd=hd["CCD"])
            for c in ["SAP_FLUX","PDCSAP_FLUX"]:
                y=np.array(d[c],float); y[q!=0]=np.nan
                m=measure(t,y,tc,DUR,win=1.0,order=2)
                rec[c]=None if (m is None or not np.isfinite(m.get("depth",np.nan))) else [round(m["depth"]*1e3,2),round(m["sig_adopt"]*1e3,2)]
            out.append(rec); count[(s,author)]=count.get((s,author),0)+1; print(rec,flush=True)
    json.dump(out,open("data/step3_neighbors.json","w"),indent=1)
