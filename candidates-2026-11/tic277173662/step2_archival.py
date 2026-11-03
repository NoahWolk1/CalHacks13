"""Depth of both vetted events in every product with data (measure.py: 6 h trapezoid, +-1 d per-segment quadratic),
with coverage, the time to the nearest data gap, and the depth converted to the target's light (SAP/QLP: /CROWDSAP)."""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, json
from lcio import load_all
from measure import measure
from common import TC, DUR
out=[]
for tc,secs in [(TC,(3,)),(3946.77,(97,))]:
    for r in load_all():
        if r['sector'] not in secs: continue
        for col in ["PDCSAP_FLUX","SAP_FLUX","KSPSAP_FLUX","DET_FLUX"]:
            if col not in r: continue
            t=r["t"]; f=r[col]; g=(r["q"]==0)&np.isfinite(f)
            tt=t[g]; br=np.where(np.diff(tt)>0.1)[0]
            edges=np.concatenate([[tt.min()],tt[br],tt[br+1],[tt.max()]])
            d=dict(event=tc,author=r['author'],sector=int(r['sector']),col=col,CROWDSAP=r['hdr1'].get('CROWDSAP'),
                   nearest_edge_d=round(float(np.min(np.abs(edges-tc))),3))
            res=measure(tt,f[g],tc,DUR,win=1.0,min_cov=0.3)
            if res is not None and np.isfinite(res.get("depth",np.nan)):
                d.update(depth_ppt=round(res['depth']*1e3,2),sig_ppt=round(res['sig_adopt']*1e3,2),beta=round(res['beta'],2),cov=round(res['cov'],2),frac_deeper=round(float(res['frac_deeper']),3))
                if col=='SAP_FLUX' and d['CROWDSAP']: d['depth_in_target_light_ppt']=round(res['depth']*1e3/d['CROWDSAP'],1)
            out.append(d); print(d)
json.dump(out,open("data/step2_archival.json","w"),indent=1)
