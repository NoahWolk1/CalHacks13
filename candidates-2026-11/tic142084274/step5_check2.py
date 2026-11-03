import warnings; warnings.filterwarnings("ignore")
import numpy as np
from lcio import load_all
from measure import measure
for s,tc in [(5,1450.07),(10,1582.866),(90,3775.0),(89,3735.03)]:
    for r in load_all(sectors=[s]):
        t=r["t"]
        for c in ["SAP_FLUX","PDCSAP_FLUX","KSPSAP_FLUX","CORR_FLUX"]:
            if c not in r: continue
            y=r[c]; w=np.abs(t-tc)<2/24
            n_fin=np.isfinite(y[w]).sum(); n_q0=(np.isfinite(y[w])&(r["q"][w]==0)).sum()
            qs=sorted(set(int(v) for v in r["q"][w]))
            yy=y.copy(); m=measure(t,yy,tc,2/24,1.0,1,min_cov=0.3)
            d="" if (m is None or not np.isfinite(m.get('depth',np.nan))) else f"{m['depth']*1e3:.1f}+-{m['sig_adopt']*1e3:.1f} (all finite, cov {m['cov']:.2f})"
            print(s,tc,r["author"],c,"cadences in +-2h finite",n_fin,"q0",n_q0,"flags",qs,d)
