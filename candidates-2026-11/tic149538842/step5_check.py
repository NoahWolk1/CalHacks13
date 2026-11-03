"""Look at the strongest detrended-flux dips not next to a census flare (S68 3174.88, S89 3733.30): SAP, DET, background, flags."""
import numpy as np, matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
from lcio import load_all
fig,ax=plt.subplots(2,1,figsize=(12,8))
for a,(sec,tc) in zip(ax,[(68,3174.88),(89,3733.30)]):
    r=load_all(sectors=[sec])[0]; t=r["t"]; w=np.abs(t-tc)<1.5
    for c,off,col in [("SAP_FLUX",0,'k'),("DET_FLUX",-0.05,'b')]:
        y=r[c][w]/np.nanmedian(r[c][w]); a.plot(t[w],y+off,'.',ms=2,c=col); qb=r["q"][w]!=0; a.plot(t[w][qb],y[qb]+off,'x',c='r',ms=3)
    b=r["SAP_BKG"][w]; a2=a.twinx(); a2.plot(t[w],b,c='g',lw=.8); a.axvspan(tc-.125,tc+.125,color='y',alpha=.3); a.set_title(f"S{sec} {tc} (green = background)")
    ev=np.abs(t-tc)<0.125; print(sec,tc,"q!=0 frac in event",float((r["q"][ev]!=0).mean()),"bits",sorted(set(int(x) for x in r["q"][ev] if x)),
          "gaps",[(round(t[i],2),round(t[i+1],2)) for i in np.where(np.diff(t)>0.1)[0] if abs(t[i]-tc)<1.5])
plt.tight_layout(); plt.savefig("figs/step5_check.png",dpi=90)
