"""Depth at both epochs in every product and column (trapezoid + per-segment quadratic baseline, measure.py, 6 h box),
using each product's good-quality cadences. Also the same with quality ignored (QLP flags many cadences)."""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, json
from lcio import load_all
from measure import measure
from common import TC, DUR, TC2
out=[]
for r in load_all():
    for tc,s in [(TC,7),(TC2,87)]:
        if r['sector']!=s: continue
        for col,f in r['flux'].items():
            for qmode in ['q0','all']:
                t=r['t']; g=np.isfinite(f)&np.isfinite(t)&(f>0 if 'SAP' in col or 'RAW' in col or col.endswith('flux') else True)
                if qmode=='q0': g&=(r['q']==0)
                m=measure(t[g],f[g],tc,DUR,win=1.0)
                d=dict(epoch=tc,sector=s,author=r['author'],col=col,quality=qmode)
                if m is not None and np.isfinite(m.get('depth',np.nan)):
                    d.update(depth_ppt=round(m['depth']*1e3,2),sig_adopt=round(m['sig_adopt']*1e3,2),sig_white=round(m['sig_white']*1e3,2),beta=round(m['beta'],2),
                             sig_emp=round(m['sig_emp']*1e3,2),frac_deeper=round(float(m['frac_deeper']),3),cov=round(m['cov'],2),n=m['n'])
                elif m is not None: d['cov']=round(m['cov'],2)
                out.append(d); print(d)
json.dump(out,open("data/step2_archival.json","w"),indent=1)
