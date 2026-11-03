import warnings; warnings.filterwarnings("ignore")
import numpy as np, matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
from lcio import load_all
from common import EV, DUR
L=load_all()
for s,tc in EV.items():
    R=[r for r in L if r["sector"]==s]
    rows=[]
    for r in R:
        for c in ["SAP_FLUX","PDCSAP_FLUX","KSPSAP_FLUX","DET_FLUX"]:
            if c in r: rows.append((r,c))
    fig,ax=plt.subplots(len(rows)+1,1,figsize=(11,2.0*(len(rows)+1)),sharex=True)
    for a,(r,c) in zip(ax,rows):
        t=r["t"]; y=r[c]; w=(np.abs(t-tc)<2.5)&np.isfinite(y)&(r["q"]==0)
        yy=(y[w]/np.nanmedian(y[w])-1)*1e3
        a.plot(t[w],yy,".",ms=1,color="0.6")
        # 30-min bins
        b=np.arange(tc-2.5,tc+2.5,1/48.); idx=np.digitize(t[w],b)
        bm=[(b[i-1]+1/96, np.nanmean(yy[idx==i])) for i in np.unique(idx) if (idx==i).sum()>=2]
        if bm: bm=np.array(bm); a.plot(bm[:,0],bm[:,1],"k.-",ms=3,lw=.6)
        wf=(np.abs(t-tc)<2.5)&(r["q"]!=0)
        for tt in t[wf&((r["q"]&32)>0)]: a.axvline(tt,color="m",lw=.5)
        a.set_ylabel(f"{r['author']}\n{c.replace('_FLUX','')}",fontsize=7)
        lo,hi=np.nanpercentile(yy,[1,99]); a.set_ylim(lo-1,hi+1)
        a.axvspan(tc-DUR/2,tc+DUR/2,color="orange",alpha=.2)
    r=[r for r in R if "SAP_BKG" in r][0]; w=np.abs(r["t"]-tc)<2.5
    ax[-1].plot(r["t"][w],r["SAP_BKG"][w],".",ms=1,color="g"); ax[-1].set_ylabel(r["author"]+"\nSAP_BKG",fontsize=7)
    ax[-1].axvspan(tc-DUR/2,tc+DUR/2,color="orange",alpha=.2); ax[-1].set_xlabel("BTJD")
    fig.suptitle(f"S{s} around BTJD {tc} (q==0; black = 30-min bins; magenta = momentum dumps)")
    fig.tight_layout(); fig.savefig(f"figs/raw_window_s{s}.png",dpi=100); plt.close(fig)
    print("done",s,len(rows))
