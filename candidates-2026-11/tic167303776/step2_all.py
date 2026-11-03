"""All SPOC 2-min sectors: SAP flux in 30-min bins, one panel per sector (dips, flares, rotation)."""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, json
from lcio import load_all
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
rs=[r for r in load_all(authors=["SPOC"])]
rs.sort(key=lambda r:r["sector"])
n=len(rs); fig,ax=plt.subplots((n+1)//2,2,figsize=(18,1.9*((n+1)//2)))
ax=ax.T.ravel() if False else ax.ravel()
stats={}
for a,r in zip(ax,rs):
    t,q=r["t"],r["q"]; y=r["SAP_FLUX"]; ok=(q==0)&np.isfinite(y)&np.isfinite(t)
    t,y=t[ok],y[ok]/np.nanmedian(y[ok])
    nb=15; m=len(t)//nb; tb=t[:m*nb].reshape(m,nb).mean(1); yb=np.median(y[:m*nb].reshape(m,nb),1)
    a.plot(tb,yb,'k.',ms=1.5); a.set_ylim(0.7,1.15); a.text(0.01,0.05,f"S{r['sector']} cam{r['camera']} ccd{r['ccd']}",transform=a.transAxes,fontsize=8)
    p1,p50,p99=np.percentile(yb,[1,50,99]); stats[r["sector"]]=dict(p1=round(1-p1,3),p99=round(p99-1,3),min=round(1-yb.min(),3),t_min=round(float(tb[np.argmin(yb)]),2),crowd=r["hdr1"].get("CROWDSAP"))
    print(r["sector"],stats[r["sector"]])
plt.tight_layout(); plt.savefig("figs/step2_all_spoc.png",dpi=70)
json.dump(stats,open("data/step2_all.json","w"),indent=1)
