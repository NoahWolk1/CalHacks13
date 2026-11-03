import warnings; warnings.filterwarnings("ignore")
import numpy as np, json
from lcio import load_all
from measure import measure
from common import TC, DUR
out=[]
for dur in [DUR, 0.25, 0.5]:
  print("== dur", dur*24)
  for r in load_all():
    if r["sector"]!=96: continue
    for col in ["PDCSAP_FLUX","SAP_FLUX","KSPSAP_FLUX"]:
        if col not in r: continue
        t=r["t"]; f=r[col].copy(); g=(r["q"]==0)&np.isfinite(f)&np.isfinite(t)
        for win in [0.75,1.0,1.5]:
            res=measure(t[g],f[g],TC,dur,win=win)
            if res is None or not np.isfinite(res.get("depth",np.nan)): print(r['author'],col,"insufficient"); continue
            d=dict(author=r['author'],col=col,win=win,dur_h=dur*24,depth_ppt=res['depth']*1e3,sig_adopt_ppt=res['sig_adopt']*1e3,sig_white_ppt=res['sig_white']*1e3,beta=res['beta'],sig_emp_ppt=res['sig_emp']*1e3,frac_deeper=res['frac_deeper'],cov=res['cov'])
            out.append(d)
            print(f"  {r['author']:5s} {col:12s} win {win} depth {d['depth_ppt']:6.3f} +- {d['sig_adopt_ppt']:.3f} (white {d['sig_white_ppt']:.3f} beta {d['beta']:.2f} emp {d['sig_emp_ppt']:.3f}) frac_deeper {d['frac_deeper']:.3f} cov {d['cov']:.2f}")
json.dump(out,open("data/step2_archival.json","w"),indent=1)
