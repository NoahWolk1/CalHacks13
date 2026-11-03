"""Raw look at both events in every product."""
import warnings; warnings.filterwarnings("ignore")
import numpy as np
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
from lcio import load_all
EV=[(3073.205,65),(3906.223,95)]
fig,ax=plt.subplots(2,1,figsize=(13,10))
for k,(tc,s) in enumerate(EV):
    off=0
    for r in load_all(sectors=[s]):
        for c in ["SAP_FLUX","PDCSAP_FLUX","DET_FLUX","SYS_RM_FLUX","FLUX"]:
            if c not in r: continue
            t=r["t"]; y=r[c]; w=(np.abs(t-tc)<3)&np.isfinite(y)&(r["q"]==0)
            if w.sum()<10: continue
            y=y[w]/np.nanmedian(y[w]); tt=t[w]
            nb=int(round((1/24)/np.median(np.diff(tt))))
            n=len(tt)//nb; tb=tt[:n*nb].reshape(n,nb).mean(1); yb=y[:n*nb].reshape(n,nb).mean(1)
            ax[k].plot(tt,(y-1)*1e3-off,',',color='0.7'); ax[k].plot(tb,(yb-1)*1e3-off,'.-',ms=3,lw=.6,label=f"{r['author']} {c}")
            print(r['author'],s,c,"rms 1h-binned ppt",np.std(yb)*1e3)
            off+=6
    ax[k].axvspan(tc-4/24,tc+4/24,color='orange',alpha=.25); ax[k].set_title(f"S{s} event {tc}"); ax[k].legend(fontsize=7,ncol=3); ax[k].set_ylim(-off-4,6)
    ax[k].set_ylabel("ppt (offset)")
ax[1].set_xlabel("BTJD"); plt.tight_layout(); plt.savefig("figs/raw_windows.png",dpi=110)
