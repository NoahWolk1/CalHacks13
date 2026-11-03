"""Variability: Lomb-Scargle of the event sector and of all QLP sectors (q=0, 1-h bins, per-sector median-normalised,
each sector high-passed at 5 d); highest peak and its semi-amplitude."""
import warnings, json; warnings.filterwarnings("ignore")
import numpy as np
from astropy.timeseries import LombScargle
from lcio import load_all
from common import EVENTS
out={}; T=[];Y=[]
for r in load_all():
    if r["author"]!="QLP": continue
    t=r["t"]; y=r["SAP_FLUX"].copy(); g=(r["q"]==0)&np.isfinite(y)&np.isfinite(t); t,y=t[g],y[g]/np.nanmedian(y[g])-1
    b=np.arange(t.min(),t.max()+1/24,1/24); i=np.digitize(t,b); tb=np.array([t[i==k].mean() for k in np.unique(i)]); yb=np.array([y[i==k].mean() for k in np.unique(i)])
    c=np.polyfit(tb-tb.mean(),yb,2); yb=yb-np.polyval(c,tb-tb.mean())
    f,p=LombScargle(tb,yb).autopower(minimum_frequency=1/12,maximum_frequency=6,samples_per_peak=5)
    k=np.argmax(p); ls=LombScargle(tb,yb); A=np.sqrt(np.sum(ls.model_parameters(f[k])[1:]**2))
    out[r["sector"]]=dict(P_d=round(1/f[k],3),power=round(float(p[k]),3),semiamp_ppt=round(A*1e3,3),rms_1h_ppt=round(float(np.std(yb))*1e3,3),fap=float(ls.false_alarm_probability(p[k])))
    print(r["sector"],out[r["sector"]])
json.dump(out,open("data/step6_var.json","w"),indent=1)
