"""Depth at the event and at the vet's 'repeat' in every QLP column, plain measure.py (8/6 h trapezoid, local polynomial)."""
import numpy as np, json
from lcio import load_all
from measure import measure
EV={65:3084.74, 97:3979.76}
out={}
for sec,tc in EV.items():
    r=load_all(sectors=[sec])[0]; t=r["t"]
    for c in ["SAP_FLUX","SYS_RM_FLUX","DET_FLUX","DET_FLUX_SML","DET_FLUX_LAG"]:
        for qok in [True]:
            g=np.isfinite(t)&np.isfinite(r[c])&((r["q"]==0) if qok else True)
            for win,order in [(1.0,2),(0.75,1),(1.5,3)]:
                m=measure(t[g],r[c][g],tc,0.25,win=win,order=order)
                if m is None or not np.isfinite(m.get("depth",np.nan)): print(sec,c,win,"none",m and m.get("cov")); continue
                key=f"S{sec}_{c}_w{win}o{order}"
                out[key]=dict(depth_ppt=m["depth"]*1e3,sig=m["sig_adopt"]*1e3,beta=m["beta"],cov=m["cov"],frac_deeper=m["frac_deeper"])
                print(key, {k:round(v,3) for k,v in out[key].items()})
json.dump(out,open("data/step2_archival.json","w"),indent=1)
