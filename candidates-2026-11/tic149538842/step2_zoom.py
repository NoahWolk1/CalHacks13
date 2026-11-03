import numpy as np, matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
from lcio import load_all
fig,ax=plt.subplots(3,1,figsize=(12,11))
for k,(sec,tc) in enumerate([(65,3084.74),(97,3979.76)]):
    r=[x for x in load_all(sectors=[sec])][0]; t=r["t"]
    for c,col in [("SAP_FLUX",'k'),("DET_FLUX",'b')]:
        f=r[c]; g=np.isfinite(t)&np.isfinite(f)&(np.abs(t-tc)<1.5)
        y=f[g]/np.nanmedian(f[g]); off=0 if c=="SAP_FLUX" else -0.04
        ax[k].plot(t[g],y+off,'.',ms=2,c=col,label=c)
        qb=g&(r["q"]!=0); ax[k].plot(t[qb],f[qb]/np.nanmedian(f[g])+off,'x',c='r',ms=3)
        # 1h bins
        tb=np.arange(tc-1.5,tc+1.5,1/24); idx=np.digitize(t[g],tb)
        yb=[np.nanmedian(y[idx==i]) if (idx==i).sum()>3 else np.nan for i in range(1,len(tb))]
        ax[k].plot(tb[:-1]+0.5/24,np.array(yb)+off,'o-',c='orange',ms=3)
    ax[k].axvspan(tc-0.125,tc+0.125,color='y',alpha=.3); ax[k].set_title(f"S{sec} around {tc}"); ax[k].legend()
r=load_all(sectors=[65])[0]; t=r["t"]; f=r["SAP_FLUX"]; g=np.isfinite(f)&(t>3084.2)&(t<3084.9)
ax[2].plot(t[g],f[g]/np.nanmedian(f[g]),'.-',ms=3); ax[2].set_title("S65 SAP 200-s cadences, flare zoom")
dt=np.diff(t[g]); print("cadence",np.median(dt)*86400)
y=f[g]/np.nanmedian(f[g]); i=np.argmax(y); print("peak time",t[g][i],"peak",y[i])
for tt,yy in zip(t[g][::3],y[::3]): print(f"{tt:.4f} {yy:.4f}")
plt.tight_layout(); plt.savefig("figs/step2_zoom.png",dpi=90)
