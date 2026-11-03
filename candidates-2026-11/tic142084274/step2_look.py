import warnings; warnings.filterwarnings("ignore")
import numpy as np, matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
from lcio import load_all
TC=1635.158
L=load_all(sectors=[12])
fig,ax=plt.subplots(len(L)*0+6,1,figsize=(11,14),sharex=True)
i=0
for r in L:
    print(r["file"].split("/")[-1], r["author"], [c for c in r["cols"]])
    t=r["t"]; w=np.abs(t-TC)<3
    for c in ["SAP_FLUX","KSPSAP_FLUX","DET_FLUX","RAW_FLUX","CORR_FLUX","PCA_FLUX"]:
        if c not in r: continue
        y=r[c]; m=w&np.isfinite(y)
        y=y/np.nanmedian(y[m]); g=m&(r["q"]==0)
        ax[i].plot(t[m],y[m],'.',color='0.7',ms=3); ax[i].plot(t[g],y[g],'k.',ms=3)
        ax[i].axvline(TC,color='r',alpha=.3); ax[i].set_ylabel(f"{r['author']}\n{c}",fontsize=8)
        lo,hi=np.nanpercentile(y[g],[1,99]); ax[i].set_ylim(lo-0.02,hi+0.02)
        i+=1
        if i>=6: break
plt.tight_layout(); plt.savefig("figs/raw_window_s12.png",dpi=110)
