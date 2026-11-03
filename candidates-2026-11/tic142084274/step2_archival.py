import warnings; warnings.filterwarnings("ignore")
import numpy as np, json
from lcio import load_all
from measure import measure
TC=1635.158; DUR=2/24
rows=[]
for r in load_all(sectors=[12]):
    for c in ["SAP_FLUX","KSPSAP_FLUX","RAW_FLUX","CORR_FLUX","PCA_FLUX"]:
        if c not in r: continue
        for qmode in ["q==0","all finite"]:
            m=(r["q"]==0) if qmode=="q==0" else np.ones_like(r["q"],bool)
            y=r[c].copy(); y[~m]=np.nan
            for order in [1,2]:
                res=measure(r["t"],y,TC,DUR,win=1.0,order=order)
                if res is None or not np.isfinite(res.get("depth",np.nan)):
                    rows.append(dict(author=r["author"],col=c,q=qmode,order=order,depth_ppt=None)); continue
                rows.append(dict(author=r["author"],col=c,q=qmode,order=order,depth_ppt=round(res["depth"]*1e3,2),
                    sig_white=round(res["sig_white"]*1e3,2),beta=round(res["beta"],2),sig_emp=round(res["sig_emp"]*1e3,2),
                    sig_adopt=round(res["sig_adopt"]*1e3,2),snr=round(res["depth"]/res["sig_adopt"],1),
                    frac_deeper=round(res["frac_deeper"],3),cov=round(res["cov"],2),n_emp=len(res["emp_dist"]),rms_ppt=round(res["rms"]*1e3,1)))
for x in rows: print(x)
json.dump(rows,open("data/step2_archival.json","w"),indent=1)
