"""Depth at the sweep epoch in every product (trapezoid + per-segment quadratic, measure.py), and the
variability amplitude (robust std of 8h-binned flux) in each product, sector 31."""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, json
from lcio import load_all
from measure import measure
from common import TC, DUR
out=[]
for r in load_all():
    if r['sector'] not in (30,31,32): continue
    for col in ["PDCSAP_FLUX","SAP_FLUX","KSPSAP_FLUX","DET_FLUX"]:
        if col not in r: continue
        t=r["t"]; f=r[col]; g=(r["q"]==0)&np.isfinite(f)&np.isfinite(t)
        # variability amplitude: std of 8h bins over the sector
        tb=np.arange(t[g].min(),t[g].max(),1/3); idx=np.digitize(t[g],tb)
        fb=np.array([np.mean(f[g][idx==i]) for i in np.unique(idx) if (idx==i).sum()>5])
        amp=1.4826*np.median(np.abs(fb/np.median(fb)-1-np.median(fb/np.median(fb)-1)))*1e3
        d=dict(sector=int(r['sector']),author=r['author'],col=col,amp8h_ppt=round(float(amp),2))
        if r['sector']==31:
            res=measure(t[g],f[g],TC,DUR,win=1.0)
            if res is not None and np.isfinite(res.get("depth",np.nan)):
                d.update(depth_ppt=round(res['depth']*1e3,2),sig_adopt_ppt=round(res['sig_adopt']*1e3,2),sig_white_ppt=round(res['sig_white']*1e3,2),
                         beta=round(res['beta'],2),sig_emp_ppt=round(res['sig_emp']*1e3,2),frac_deeper=round(float(res['frac_deeper']),3),cov=round(res['cov'],2),
                         depth_over_amp=round(res['depth']*1e3/amp,2))
        out.append(d); print(d)
json.dump(out,open("data/step2_archival.json","w"),indent=1)
