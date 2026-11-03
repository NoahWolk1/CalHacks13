import warnings; warnings.filterwarnings("ignore")
import numpy as np, json
from lcio import load_all
from measure import measure
from common import EV, DUR
L=load_all()
rows=[]
for s,tc in EV.items():
    for r in [r for r in L if r["sector"]==s]:
        for c in ["SAP_FLUX","PDCSAP_FLUX","KSPSAP_FLUX","DET_FLUX"]:
            if c not in r: continue
            y=r[c].copy(); y[r["q"]!=0]=np.nan
            for order in [2,3]:
                res=measure(r["t"],y,tc,DUR,win=1.0,order=order)
                if res is None or not np.isfinite(res.get("depth",np.nan)):
                    rows.append(dict(sector=s,author=r["author"],col=c,order=order,depth_ppt=None)); continue
                rows.append(dict(sector=s,author=r["author"],col=c,order=order,
                    depth_ppt=round(res["depth"]*1e3,2),sig_white=round(res["sig_white"]*1e3,2),beta=round(res["beta"],2),
                    sig_emp=round(res["sig_emp"]*1e3,2),sig_adopt=round(res["sig_adopt"]*1e3,2),
                    snr=round(res["depth"]/res["sig_adopt"],1),frac_deeper=round(res["frac_deeper"],3),cov=round(res["cov"],2),n_emp=len(res["emp_dist"])))
                print(rows[-1],flush=True)
json.dump(rows,open("data/step2_archival.json","w"),indent=1)
