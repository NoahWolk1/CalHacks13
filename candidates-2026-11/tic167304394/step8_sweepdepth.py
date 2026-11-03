"""How a 61 ppt eclipse becomes a 3.66 ppt "find": box depth at the sweep's tc/duration under outlier clipping and binning."""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, pandas as pd
from lcio import load_all
r=[r for r in load_all() if r["sector"]==31][0]; t=r["t"]; y=r["SAP_FLUX"]; g=(r["q"]==0)&np.isfinite(y); t=t[g]; y=y[g]
f=y/pd.Series(y).rolling(145,center=True,min_periods=30).median().to_numpy()-1
def box(t,f,tc=2169.292,dur=0.125):
    m=np.abs(t-tc)<dur/2; o=(np.abs(t-tc)>dur)&(np.abs(t-tc)<1); return (np.mean(f[o])-np.mean(f[m]))*1e3, m.sum()
print("no clipping, 1-d median detrend:",box(t,f))
for k in [3,5,10,15,20,30]:
    s=1.4826*np.median(np.abs(f-np.median(f))); keep=np.abs(f-np.median(f))<k*s
    print(f"{k}-sigma clip (sigma {s*1e3:.2f} ppt), points removed in box:",(~keep&(np.abs(t-2169.292)<0.0625)).sum(),"->",box(t[keep],f[keep]))
