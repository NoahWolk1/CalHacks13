import warnings; warnings.filterwarnings("ignore")
import glob, json, numpy as np
from astropy.io import fits
from measure import measure
from lcio import load_all
EV={"1385.094":(1385.094,0.125),"1389.59":(1389.59,0.25),"1391.135":(1391.135,0.283),"1394.01":(1394.01,0.2)}
src={}
d=fits.open(glob.glob("data/lc_other/**/*tasoc*cbv-lc.fits",recursive=True)[0])[1].data
src["TASOC FLUX_RAW"]=(np.array(d["TIME"],float),np.array(d["FLUX_RAW"],float))
src["TASOC FLUX_CORR"]=(np.array(d["TIME"],float),np.array(d["FLUX_CORR"],float))
d=fits.open(glob.glob("data/lc_other/**/*eleanor*.fits",recursive=True)[0])[1].data
for c in ["RAW_FLUX","CORR_FLUX","PCA_FLUX"]: src["eleanor-lite "+c]=(np.array(d["TIME"],float),np.array(d[c],float))
r=[r for r in load_all() if r["sector"]==3][0]
for c in ["SAP_FLUX","KSPSAP_FLUX"]: src["QLP "+c+" (all cadences)"]=(r["t"],r[c])
o=np.load("data/own_phot_s3.npz"); 
for k in ["r1.5","r2.5"]: src["own TESScut "+k+" (global sky)"]=(o["t"],o[k])
res={}
for n,(tc,du) in EV.items():
    res[n]={}
    for s,(t,f) in src.items():
        f=f.copy(); f[~np.isfinite(f)]=np.nan
        m=measure(t,f,tc,du,win=0.75 if tc<1386 else 1.0,order=1 if tc<1386 else 2)
        res[n][s]=None if m is None or not np.isfinite(m.get("depth",np.nan)) else f"{m['depth']*1e3:.2f} ± {m['sig_adopt']*1e3:.2f} (cov {m['cov']:.2f})"
print(json.dumps(res,indent=1)); json.dump(res,open("data/step2_otherpipes.json","w"),indent=1)
# QLP KSPSAP point scatter pre-science vs science
t=r["t"]; k=r["KSPSAP_FLUX"]
for a,b in [(1384.3,1385.9),(1385.95,1388.5),(1396.7,1405)]:
    w=(t>a)&(t<b)&np.isfinite(k); print("QLP KSPSAP pt-to-pt rms",a,b, round(np.nanstd(np.diff(k[w]))/np.sqrt(2)*1e3,2),"ppt")
t=o["t"]; f=o["r1.5"]
for a,b in [(1384.3,1385.9),(1385.95,1388.5)]:
    w=(t>a)&(t<b); x=f[w]/np.nanmedian(f[w]); print("own r1.5 pt-to-pt rms",a,b, round(np.nanmedian(np.abs(np.diff(x)))*1.4826/np.sqrt(2)*1e3,2),"ppt (robust)")
