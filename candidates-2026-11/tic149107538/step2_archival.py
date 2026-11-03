"""Depth at the sweep epoch in every product: 8 h trapezoid on a per-segment polynomial baseline (measure.py),
for several windows/orders, sector 67."""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, json
from lcio import load_all
from measure import measure
from common import TC, DUR
out=[]
for r in load_all(sectors=[67]):
    for col in ["PDCSAP_FLUX","SAP_FLUX","KSPSAP_FLUX","DET_FLUX","SYS_RM_FLUX","FLUX"]:
        if col not in r: continue
        t=r["t"]; f=r[col]; g=(r["q"]==0)&np.isfinite(f)&np.isfinite(t)
        for win,order in [(1.0,2),(0.75,2),(1.0,3),(1.5,3),(0.6,1)]:
            res=measure(t[g],f[g],TC,DUR,win=win,order=order)
            if res is None or not np.isfinite(res.get("depth",np.nan)): continue
            d=dict(author=r['author'],col=col,win=win,order=order,depth_ppt=round(res['depth']*1e3,3),sig_adopt_ppt=round(res['sig_adopt']*1e3,3),
                   sig_white_ppt=round(res['sig_white']*1e3,3),beta=round(res['beta'],2),sig_emp_ppt=round(res['sig_emp']*1e3,3),frac_deeper=round(float(res['frac_deeper']),3))
            out.append(d); print(d)
json.dump(out,open("data/step2_archival.json","w"),indent=1)
