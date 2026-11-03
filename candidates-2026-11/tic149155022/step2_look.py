"""Raw windows around each event: every product/column, background, centroids, quality."""
import numpy as np, matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt, sys
from lcio import load_all
from cfg import *
events=[TC]+([TC2] if "TC2" in globals() else [])
W=float(sys.argv[1]) if len(sys.argv)>1 else 2.0
for tc in events:
    recs=[r for r in load_all() if r["t"].min()-0.1<tc<r["t"].max()+0.1]
    rows=[]
    for r in recs:
        for c in ["SAP_FLUX","KSPSAP_FLUX","DET_FLUX","RAW_FLUX","CORR_FLUX","PCA_FLUX","FLUX_RAW","FLUX_CORR"]:
            if c in r: rows.append((r,c))
    fig,ax=plt.subplots(len(rows)+3,1,figsize=(10,2*(len(rows)+3)),sharex=True)
    for i,(r,c) in enumerate(rows):
        t=r["t"]; f=r[c]; m=(np.abs(t-tc)<W)&np.isfinite(f)
        good=m&(r["q"]==0); bad=m&(r["q"]!=0)
        med=np.nanmedian(f[good]) if good.any() else np.nanmedian(f[m])
        ax[i].plot(t[good],f[good]/med,".",ms=3); ax[i].plot(t[bad],f[bad]/med,"x",ms=3,c="r")
        ax[i].set_ylabel(f"{r['author']}\n{c}",fontsize=7); ax[i].axvspan(tc-DUR/2,tc+DUR/2,alpha=.15)
        lo,hi=np.nanpercentile(f[good]/med,[0.5,99.5]) if good.sum()>5 else (0.98,1.02); ax[i].set_ylim(lo-0.004,hi+0.004)
        print(tc, r["author"], r["sector"], c, "n", m.sum(), "flagged", bad.sum(), "flags", np.unique(r["q"][bad]))
    r=[x for x in recs if x["author"]=="QLP"][0]; t=r["t"]; m=np.abs(t-tc)<W
    ax[-3].plot(t[m],r["SAP_BKG"][m],"."); ax[-3].set_ylabel("QLP bkg")
    ax[-2].plot(t[m],r["SAP_X"][m]-np.nanmedian(r["SAP_X"][m]),".",label="x"); ax[-2].plot(t[m],r["SAP_Y"][m]-np.nanmedian(r["SAP_Y"][m]),".",label="y"); ax[-2].legend(); ax[-2].set_ylabel("QLP centroid")
    ax[-1].plot(t[m],r["q"][m],"."); ax[-1].set_ylabel("QLP quality")
    for a in ax: a.axvline(tc,c="k",lw=.5)
    plt.tight_layout(); plt.savefig(f"figs/raw_window_{tc:.0f}.png",dpi=80); plt.close()
