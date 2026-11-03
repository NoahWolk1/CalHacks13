"""The 1449.052 event in every product (S5): depths with red-noise errors, and a zoom plot."""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, json
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
from hlsp import load
from measure import measure
from common import TC, DUR
L=[r for r in load() if r["sector"]==5]
rows=[]; panels=[]
for r in L:
    for c,y in r["cols"].items():
        t=r["t"]; yy=y.copy(); yy[~r["good"]]=np.nan
        isb=any(s in c for s in ["BKG","BGV","_X","_Y","CENTROID","background"])
        panels.append((r["author"],c,t,y,r["good"],isb))
        if isb: continue
        if np.isfinite(yy[np.abs(t-TC)<1]).sum()<15: continue
        for order in [1,2]:
            res=measure(t,yy,TC,DUR,1.0,order)
            if res is None or not np.isfinite(res.get("depth",np.nan)): continue
            rows.append(dict(author=r["author"],col=c,order=order,depth_ppt=round(res["depth"]*1e3,2),sig_white=round(res["sig_white"]*1e3,2),beta=round(res["beta"],2),
                    sig_emp=round(res["sig_emp"]*1e3,2),sig_adopt=round(res["sig_adopt"]*1e3,2),snr=round(res["depth"]/res["sig_adopt"],1),frac_deeper=round(res["frac_deeper"],3),cov=round(res["cov"],2)))
            print(rows[-1],flush=True)
json.dump(rows,open("data/step2_look.json","w"),indent=1)
n=len(panels); fig,axs=plt.subplots(n,1,figsize=(10,1.7*n),sharex=True)
for ax,(a_,c,t,y,g,isb) in zip(axs,panels):
    w=(np.abs(t-TC)<2)&np.isfinite(y)
    if w.sum()<3: continue
    nm=1 if isb else np.nanmedian(y[w]); off=0 if isb else 1; sc=1 if isb else 1e3
    ax.plot((t[w&g]-TC)*24,(y[w&g]/nm-off)*sc,"k.",ms=2); ax.plot((t[w&~g]-TC)*24,(y[w&~g]/nm-off)*sc,"r.",ms=2)
    ax.axvspan(-2,2,color="y",alpha=.2); ax.text(0.01,0.8,f"{a_} {c}",transform=ax.transAxes,fontsize=7)
    if not isb: ax.set_ylim(-40,30)
axs[-1].set_xlabel("hours from 1449.052")
fig.tight_layout(); fig.savefig("figs/step2_zoom.png",dpi=75)
