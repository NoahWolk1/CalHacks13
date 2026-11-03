import warnings; warnings.filterwarnings("ignore")
import numpy as np
from lightkurve.utils import TessQualityFlags as F
from lcio import load_all
from common import EV, DUR
L=load_all()
for s,t0 in EV.items():
    for r in [r for r in L if r["sector"]==s]:
        t,q=r["t"],r["q"]
        w=(t>t0-1.5)&(t<t0+1.5)&(q!=0)
        print(f"\nS{s} {r['author']}: flagged cadences within 1.5 d: {w.sum()}")
        for v in np.unique(q[w]):
            tt=t[w&(q==v)]
            print(f"  q={v} {F.decode(int(v) & 0xFFFFFF) if v & 0xFFFFFF else ''}{' +bit30' if v & (1<<30) else ''}: n={len(tt)} t={np.nanmin(tt):.3f}..{np.nanmax(tt):.3f}")
        d=t[(q & 32)>0]; d=d[np.isfinite(d)]
        if len(d):
            groups=np.split(d, np.where(np.diff(d)>0.1)[0]+1)
            print("  desat epochs:", [round(g.mean(),3) for g in groups])
        good=np.isfinite(t)&np.isfinite(r["SAP_FLUX"])&(q==0)
        tf=t[good]; gi=np.where(np.diff(tf)>0.1)[0]
        print("  gaps>0.1d in q==0 data:", [(round(tf[i],3),round(tf[i+1],3)) for i in gi])
        print("  q==0 span", round(tf.min(),3), round(tf.max(),3), " event window",round(t0-DUR/2,3),round(t0+DUR/2,3))
