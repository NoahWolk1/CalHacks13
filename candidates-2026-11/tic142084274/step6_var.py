"""Rotation / variability (Lomb-Scargle on SPOC 2-min PDCSAP) and flares near the event in own photometry."""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, json
from astropy.timeseries import LombScargle
from lcio import load_all
out={}
for r in load_all(authors=["SPOC"]):
    t,y=r["t"],r["PDCSAP_FLUX"]; ok=(r["q"]==0)&np.isfinite(y); t,y=t[ok],y[ok]/np.nanmedian(y[ok])
    f,p=LombScargle(t,y).autopower(minimum_frequency=1/12,maximum_frequency=24,samples_per_peak=10)
    k=np.argmax(p); P=1/f[k]
    ph=(t%P)/P; bins=np.array([np.median(y[(ph>=i/10)&(ph<(i+1)/10)]) for i in range(10)])
    out[int(r["sector"])]=dict(P_h=round(P*24,3),power=round(float(p[k]),3),amp_ppt=round((bins.max()-bins.min())*1e3/2,2))
print(out)
Ps=[v["P_h"] for v in out.values() if v["power"]>0.05]; print("sectors with power>0.05:",len(Ps),"median P (h)",np.median(Ps) if Ps else None)
json.dump(out,open("data/step6_var.json","w"),indent=1)
