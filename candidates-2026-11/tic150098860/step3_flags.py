import warnings; warnings.filterwarnings("ignore")
import numpy as np, matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
from lcio import load_all
lcs=load_all()
for s,tc,w in [(4,1417.097,2.0),(98,4009.601,1.0)]:
    r=[x for x in lcs if x["sector"]==s and x["author"]=="SPOC"][0]
    t=r["t"]; q=r["q"]
    m=np.abs(t-tc)<w
    # list flag transitions
    print(f"--- S{s} SPOC cam{r['camera']} ccd{r['ccd']}; time range {np.nanmin(t):.3f}-{np.nanmax(t):.3f}")
    for b in range(0,31):
        bit=1<<b; mm=m&((q&bit)>0)
        if mm.sum(): 
            tt=t[mm]; print(f" bit {bit}: n={mm.sum()} times {tt.min():.3f}-{tt.max():.3f}", np.round(tt[np.r_[True,np.diff(tt)>0.01]],3)[:12])
    fin=np.isfinite(t)
    gaps=np.where(np.diff(t[fin])>0.02)[0]
    for g in gaps:
        a,b=t[fin][g],t[fin][g+1]
        if abs(a-tc)<3: print(f" gap {a:.3f}-{b:.3f}")
    fig,ax=plt.subplots(5,1,figsize=(11,11),sharex=True)
    g=m&(q==0)
    for i,c in enumerate(["SAP_FLUX","PDCSAP_FLUX","SAP_BKG","MOM_CENTR1","MOM_CENTR2"]):
        ax[i].plot(t[g],r[c][g],',k'); 
        # bin 30 min
        tb=np.arange(tc-w,tc+w,1/48); fb=[np.nanmedian(r[c][g][(t[g]>=a)&(t[g]<a+1/48)]) if ((t[g]>=a)&(t[g]<a+1/48)).sum()>3 else np.nan for a in tb]
        ax[i].plot(tb+1/96,fb,'r.-'); ax[i].set_ylabel(c)
        ax[i].axvspan(tc-1/6,tc+1/6,color='g',alpha=.15)
        for tt in t[m&((q&32)>0)]: ax[i].axvline(tt,color='b',lw=.5)
        lo,hi=np.nanpercentile(r[c][g],[0.5,99.5]); ax[i].set_ylim(lo-(hi-lo)*.1,hi+(hi-lo)*.1)
    P=10.6953065117; T0=3966.946848
    for n in range(-300,10):
        tt=T0+n*P
        if abs(tt-tc)<w: [a.axvspan(tt-.045,tt+.045,color='r',alpha=.2) for a in ax]
    plt.tight_layout(); plt.savefig(f"figs/step3_flags_S{s}.png",dpi=100)
