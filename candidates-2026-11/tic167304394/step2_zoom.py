"""Raw QLP SAP of the two deep events, overlaid on a common time axis."""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
from lcio import load_all
L=load_all()
fig,ax=plt.subplots(1,1,figsize=(9,5))
for s,tc,col in [(31,2169.21,"k"),(67,3148.74,"C3"),(89,3733.31,"C0")]:
    r=[r for r in L if r["sector"]==s][0]; t=r["t"]; y=r["SAP_FLUX"]
    g=(r["q"]==0)&np.isfinite(y)&(np.abs(t-tc)<0.5)
    oot=g&(np.abs(t-tc)>0.15)
    p=np.polyfit(t[oot]-tc,y[oot],2); f=(y/np.polyval(p,t-tc)-1)*1e3
    ax.plot((t[g]-tc)*24,f[g],".-",ms=3,lw=.5,color=col,label=f"S{s} t-{tc}")
    print(f"S{s}")
    for ti,fi,qi in zip(t[np.abs(t-tc)<0.12],f[np.abs(t-tc)<0.12],r["q"][np.abs(t-tc)<0.12]): print(f"  {ti:.4f} {(ti-tc)*24:6.2f} h  {fi:7.2f} q={qi}")
ax.set_xlabel("hours"); ax.set_ylabel("ppt (QLP SAP, quadratic baseline)"); ax.legend(); ax.set_xlim(-10,10)
fig.tight_layout(); fig.savefig("figs/events_overlay.png",dpi=100)
