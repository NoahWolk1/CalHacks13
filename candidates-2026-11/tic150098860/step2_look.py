import warnings; warnings.filterwarnings("ignore")
import numpy as np, matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
from lcio import load_all
P=10.6953065117; T0=3966.946848
lcs=load_all()
EV=[(4,1417.097),(98,4009.601)]
fig,axs=plt.subplots(2,1,figsize=(14,9))
for ax,(s,tc) in zip(axs,EV):
    off=0
    for r in lcs:
        if r["sector"]!=s: continue
        t=r["t"]; good=(r["q"]==0)&np.isfinite(t)
        for col in ["PDCSAP_FLUX","SAP_FLUX","KSPSAP_FLUX"]:
            if col not in r: continue
            f=r[col]; m=good&np.isfinite(f)&(np.abs(t-tc)<4)
            if m.sum()<10: continue
            ff=f[m]/np.nanmedian(f[m])
            dt=np.median(np.diff(t[m]))
            nb=max(1,int(round((30/1440)/dt)))
            n=len(ff)//nb
            tb=t[m][:n*nb].reshape(n,nb).mean(1); fb=ff[:n*nb].reshape(n,nb).mean(1)
            ax.plot(t[m],ff-off,',',alpha=0.3); ax.plot(tb,fb-off,'.',ms=3,label=f"{r['author']} {col}")
            off+=0.003
            print(s,r['author'],col,"cadences in +-4d",m.sum(),"q!=0 near tc:",np.unique(r['q'][np.abs(t-tc)<0.5]))
    for n in range(-300,10):
        tt=T0+n*P
        if abs(tt-tc)<4: ax.axvspan(tt-0.045,tt+0.045,color='r',alpha=0.2)
    ax.axvspan(tc-1/6,tc+1/6,color='g',alpha=0.15)
    ax.set_title(f"S{s} event {tc} (green=8h box, red=TOI-220 b predicted)"); ax.legend(fontsize=7)
plt.tight_layout(); plt.savefig("figs/step2_look.png",dpi=110)
