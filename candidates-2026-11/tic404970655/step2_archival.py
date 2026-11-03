"""Depth at the sweep epoch in every S31 product: (a) the sweep's 8 h box at 2155.565 on a +-1 d quadratic (measure.py);
(b) a 30 h box at the OGLE-predicted primary 2155.64 on a +-2.5 d quadratic; (c) the secondary (8 h box at 2162.14).
Also QLP KSPSAP vs SAP to explain the vet's 'QLP 0.386 ppt'."""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, json
from lcio import load_all
from measure import measure
out=[]
for r in load_all():
    if r['sector']!=31: continue
    for col in ["PDCSAP_FLUX","SAP_FLUX","KSPSAP_FLUX"]:
        if col not in r: continue
        t=r["t"]; f=r[col]; g=(r["q"]==0)&np.isfinite(f)&np.isfinite(t)
        d=dict(author=r['author'],col=col,CROWDSAP=r['hdr1'].get('CROWDSAP'))
        for lab,tc,dur,win in [("sweep_8h_2155.565",2155.565,1/3,1.0),("primary_30h_2155.64",2155.64,1.25,2.5),("secondary_8h_2162.14",2162.14,1/3,1.0)]:
            res=measure(t[g],f[g],tc,dur,win=win)
            if res is None or not np.isfinite(res.get("depth",np.nan)): d[lab]=None; continue
            d[lab]=dict(depth_ppt=round(res['depth']*1e3,2),sig_ppt=round(res['sig_adopt']*1e3,2),cov=round(res['cov'],2))
        out.append(d); print(d)
json.dump(out,open("data/step2_archival.json","w"),indent=1)
