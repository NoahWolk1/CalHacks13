"""Event window (S32) in every product and column: raw curves, 30-min bins."""
import warnings; warnings.filterwarnings("ignore")
import numpy as np
from lcio import load_all
from common import *
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
R=load_all(sectors=[32])
fig,ax=plt.subplots(len(R),1,figsize=(12,3.2*len(R)),squeeze=False)
for a,r in zip(ax[:,0],R):
    t=r["t"]; print(r["file"], r["author"], r["cols"])
    off=0
    for c in ["SAP_FLUX","PDCSAP_FLUX","KSPSAP_FLUX","DET_FLUX","SYS_RM_FLUX","FLUX"]:
        if c not in r: continue
        y=r[c].copy(); ok=np.isfinite(y)&(r["q"]==0); w=ok&(np.abs(t-TC)<2.5)
        if w.sum()<10: continue
        yy=y[w]/np.nanmedian(y[w]); tt=t[w]
        nb=max(int(round((0.5/24)/np.median(np.diff(tt)))),1); n=len(tt)//nb
        a.plot(tt,(yy-1)*1e3-off,',',color='0.6'); a.plot(tt[:n*nb].reshape(n,nb).mean(1),(yy[:n*nb].reshape(n,nb).mean(1)-1)*1e3-off,'.',ms=4,label=c)
        off+=8
    a.axvspan(TC-DUR/2,TC+DUR/2,color='orange',alpha=.2); a.legend(fontsize=7,loc='lower left'); a.set_title(r["author"]+" S32"); a.set_ylim(-off-4,6)
plt.tight_layout(); plt.savefig("figs/step2_window_s32.png",dpi=100)
