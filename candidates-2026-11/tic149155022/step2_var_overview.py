"""Whole-sector QLP SAP for every sector + Lomb-Scargle: what is the large variability?"""
import numpy as np, matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt, json
from astropy.timeseries import LombScargle
from lcio import load_all
from cfg import *
recs=[r for r in load_all(authors=["QLP"])]
fig,ax=plt.subplots(len(recs),1,figsize=(12,1.6*len(recs)))
out=[]
for a,r in zip(ax,recs):
    t=r["t"]; f=r["SAP_FLUX"]; g=(r["q"]==0)&np.isfinite(f)
    y=f[g]/np.nanmedian(f[g])
    a.plot(t[g],y,".",ms=1); a.set_ylabel(f"S{r['sector']}",fontsize=7)
    ls=LombScargle(t[g],y); fr,pw=ls.autopower(minimum_frequency=1/12,maximum_frequency=24,samples_per_peak=10)
    i=np.argmax(pw); p=1/fr[i]
    amp=np.ptp(np.percentile(y,[2,98]))
    out.append(dict(sector=r["sector"],cam=r["camera"],ccd=r["ccd"],P_best=round(p,4),power=round(pw[i],3),p2p_2_98=round(amp,4),rms=round(np.std(y),4)))
    print(out[-1])
    if TC> t.min() and TC<t.max(): a.axvline(TC,c="r")
plt.tight_layout(); plt.savefig("figs/all_sectors_sap.png",dpi=70)
json.dump(out,open("data/step2_var_overview.json","w"),indent=1)
