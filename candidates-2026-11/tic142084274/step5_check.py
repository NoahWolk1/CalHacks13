"""Cross-check each candidate dip from the all-data search in every product covering it."""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, json
from lcio import load_all
from measure import measure
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
EV=[(10,1582.866),(3,1395.40),(5,1450.07),(4,1411.08),(9,1544.32),(11,1597.45),(27,2058.07),(90,3775.0),(28,2071.43),(89,3735.03),(12,1635.158),(12,1649.74)]
L=load_all()
res=[]
fig,axs=plt.subplots(len(EV),1,figsize=(10,2.2*len(EV)))
for ax,(s,tc) in zip(axs,EV):
    k=0
    for r in [r for r in L if r["sector"]==s]:
        for c in ["SAP_FLUX","PDCSAP_FLUX","KSPSAP_FLUX","RAW_FLUX","CORR_FLUX"]:
            if c not in r: continue
            t=r["t"]; y=r[c].copy(); qok=(r["q"]==0) if r["author"]!="ELEANOR-LITE" else np.isin(r["q"],[0,128])
            y[~qok]=np.nan
            m=measure(t,y,tc,2/24,1.0,1)
            if m is None or not np.isfinite(m.get("depth",np.nan)):
                res.append(dict(sector=s,tc=tc,author=r["author"],col=c,depth=None)); continue
            res.append(dict(sector=s,tc=tc,author=r["author"],col=c,depth=round(m['depth']*1e3,1),sig=round(m['sig_adopt']*1e3,1),cov=round(m['cov'],2)))
            print(res[-1])
            w=np.abs(t-tc)<0.6
            yy=y/np.nanmedian(y[w])
            ax.plot(t[w],(yy[w]-1)*1e3-30*k,'.',ms=2,label=f"{r['author']} {c}: {res[-1]['depth']}±{res[-1]['sig']}")
            k+=1
    ax.axvline(tc,color='r',alpha=.3); ax.legend(fontsize=5,loc='lower left',ncol=2); ax.set_title(f"S{s} t={tc}",fontsize=8)
plt.tight_layout(); plt.savefig("figs/other_dips_check.png",dpi=90)
json.dump(res,open("data/step5_check.json","w"),indent=1)
