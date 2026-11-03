"""Depth at both events in every product: (a) local polynomial baseline (measure.py, ±1 d), (b) after removing a per-sector
harmonic model of the 2.374 d SB1 signal (3 harmonics) + the 4.42 d signal (2 harmonics) fitted with the event masked."""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, json
from lcio import load_all
from measure import measure
from common import *
rows=[]
for tc,sec in [(TC1,65),(TC2,95)]:
    for r in load_all(sectors=[sec]):
        for c in ["SAP_FLUX","PDCSAP_FLUX","DET_FLUX","SYS_RM_FLUX","FLUX"]:
            if c not in r: continue
            t=r["t"]; y=r[c].copy(); ok=np.isfinite(y)&np.isfinite(t)&(r["q"]==0); y[~ok]=np.nan
            y=y/np.nanmedian(y)
            for lab,yy in [("raw",y)]+[("minus harmonic model",None)]:
                if yy is None:
                    m=ok&(np.abs(t-tc)>0.4)
                    yy=y.copy(); yy[ok]=y[ok]/harm_fit(t[ok],y[ok],m[ok])
                for win,order in [(1.0,2),(0.75,1),(1.5,2)]:
                    res=measure(t,yy,tc,DUR,win=win,order=order)
                    if res is None or not np.isfinite(res.get("depth",np.nan)):
                        rows.append(dict(sector=sec,author=r["author"],col=c,model=lab,win=win,order=order,depth_ppt=None,cov=None if res is None else res.get("cov"))); continue
                    rows.append(dict(sector=sec,author=r["author"],col=c,model=lab,win=win,order=order,depth_ppt=round(res["depth"]*1e3,2),
                        sig_adopt=round(res["sig_adopt"]*1e3,2),sig_white=round(res["sig_white"]*1e3,3),beta=round(res["beta"],2),sig_emp=round(res["sig_emp"]*1e3,2),
                        frac_deeper=round(res["frac_deeper"],3),cov=round(res["cov"],2)))
                    print(rows[-1])
json.dump(rows,open("data/step2_archival.json","w"),indent=1)
