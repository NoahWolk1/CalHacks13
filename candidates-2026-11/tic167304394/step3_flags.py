"""Quality flags within +-1.5 d of the vet's four epochs (QLP bit meanings per lightkurve TessQualityFlags)."""
import warnings; warnings.filterwarnings("ignore")
import numpy as np
from lightkurve.utils import TessQualityFlags as Fq
from lcio import load_all
L=load_all()
for name,t0 in [("main",2169.221),("dip2",3148.752),("rep",3733.31),("bright",3000.02)]:
    r=[r for r in L if np.nanmin(r["t"])-0.5<t0<np.nanmax(r["t"])+0.5][0]; t,q=r["t"],r["q"]
    w=(np.abs(t-t0)<1.5)&(q!=0); print(f"{name} S{r['sector']}: flagged cadences within 1.5 d: {w.sum()}; within the 3.4 h window: {((np.abs(t-t0)<0.071)&(q!=0)).sum()}")
    for v in np.unique(q[w]):
        tt=t[w&(q==v)]; print(f"   q={v} {Fq.decode(int(v))}: n={len(tt)} {np.nanmin(tt):.3f}..{np.nanmax(tt):.3f}")
    g=(q==0)&np.isfinite(r["SAP_FLUX"]); tf=t[g]; gi=np.where(np.diff(tf)>0.1)[0]
    print("   gaps>0.1 d:",[(round(tf[i],2),round(tf[i+1],2)) for i in gi],"  q=0 span",round(tf.min(),2),round(tf.max(),2))
