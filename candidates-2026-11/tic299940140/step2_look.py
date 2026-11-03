import warnings; warnings.filterwarnings("ignore")
import numpy as np, glob
from astropy.io import fits
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
from lcio import load_all
TC=1426.302
L=[r for r in load_all() if r["sector"]==4]
fig,ax=plt.subplots(2,1,figsize=(13,9))
k=0
for r in L:
    for c in ["SAP_FLUX","PDCSAP_FLUX","KSPSAP_FLUX","DET_FLUX"]:
        if c not in r: continue
        t,y,q=r["t"],r[c],r["q"]
        g=np.isfinite(y)&np.isfinite(t)
        yn=y/np.nanmedian(y[g&(q==0)])
        for a,win in [(ax[0],30),(ax[1],2)]:
            w=g&(np.abs(t-TC)<win)
            a.plot(t[w&(q==0)],(yn[w&(q==0)]-1)*1e3-25*k,".",ms=2,label=f"{r['author']} {c}")
            a.plot(t[w&(q!=0)],(yn[w&(q!=0)]-1)*1e3-25*k,"x",ms=3,color="r")
        k+=1
        w=g&(np.abs(t-TC)<0.07)&(q==0); wo=g&(np.abs(t-TC)>0.2)&(np.abs(t-TC)<0.8)&(q==0)
        print(r["author"],c,"in-transit mean dev ppt",round((np.nanmedian(yn[wo])-np.nanmean(yn[w]))*1e3,2),"n_in",w.sum(), "q at TC +/-0.1:",np.unique(q[np.abs(t-TC)<0.1]))
for a in ax: a.axvline(TC,color="orange",alpha=.4); a.legend(fontsize=6,ncol=3)
ax[0].set_title("TIC 299940140 S4 (red x = flagged)"); ax[1].set_xlabel("BTJD")
fig.tight_layout(); fig.savefig("figs/raw_window_s4.png",dpi=110)
