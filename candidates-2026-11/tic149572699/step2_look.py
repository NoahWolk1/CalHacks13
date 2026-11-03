"""Overview: sector list, cadence, and the event window in every QLP column (plot)."""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, sys
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
from lcio import load_all
from common import EV, DUR
L=load_all()
for r in L:
    t=r["t"]; g=np.isfinite(t)
    print(r["author"],r["sector"],r["camera"],r["ccd"],round(np.nanmin(t),2),round(np.nanmax(t),2),round(np.nanmedian(np.diff(t[g]))*1440,1),"min", [c for c in r if c.endswith("FLUX") or c.endswith("SML") or c.endswith("LAG")])
tc=float(sys.argv[1]) if len(sys.argv)>1 else EV
W=float(sys.argv[2]) if len(sys.argv)>2 else 1.5
rs=[r for r in L if np.nanmin(r["t"])<tc<np.nanmax(r["t"])]
cols=["SAP_FLUX","KSPSAP_FLUX","DET_FLUX","SYS_RM_FLUX","KSPSAP_FLUX_SML","KSPSAP_FLUX_LAG","PDCSAP_FLUX","SAP_BKG"]
fig,ax=plt.subplots(len(cols),len(rs),figsize=(7*len(rs),2.0*len(cols)),squeeze=False,sharex=True)
for j,r in enumerate(rs):
    w=(np.abs(r["t"]-tc)<W)
    for i,c in enumerate(cols):
        if c not in r: continue
        y=r[c][w]; q=r["q"][w]; t=r["t"][w]
        yn=y/np.nanmedian(y)-1 if c!="SAP_BKG" else y-np.nanmedian(y)
        ax[i,j].plot(t[q==0],yn[q==0]*(1e3 if c!="SAP_BKG" else 1),".",ms=2); ax[i,j].plot(t[q!=0],yn[q!=0]*(1e3 if c!="SAP_BKG" else 1),"x",ms=3,c="r")
        # 1h bins
        b=np.arange(tc-W,tc+W,1/24.); 
        idx=np.digitize(t[q==0],b); bb=[np.nanmean(yn[q==0][idx==k]) for k in range(1,len(b))]
        ax[i,j].plot(b[:-1]+0.5/24,np.array(bb)*(1e3 if c!="SAP_BKG" else 1),"k-",lw=1)
        ax[i,j].axvspan(tc-DUR/2,tc+DUR/2,alpha=.15,color="orange"); ax[i,j].set_ylabel(c,fontsize=7)
        if c!="SAP_BKG":
            s=np.nanstd(yn[q==0])*1e3
            if np.isfinite(s) and s>0: ax[i,j].set_ylim(-4*s,3*s)
    ax[0,j].set_title(f"{r['author']} S{r['sector']} around {tc}")
fig.tight_layout(); fig.savefig(f"figs/step2_window_{tc:.2f}.png",dpi=80)
