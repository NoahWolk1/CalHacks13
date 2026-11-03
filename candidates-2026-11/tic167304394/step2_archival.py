"""Depths of the two deep events (true centres) and of the vet's 3733.31 / 3000.02 events in every QLP column."""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, json
from lcio import load_all
from measure import measure
L=load_all()
EVS=[("main",31,2169.225,3.4/24),("dip2",67,3148.750,3.4/24),("main_vet_tc",31,2169.292,3/24),("rep",89,3733.31,3/24),("bright",62,3000.02,3/24)]
rows=[]
for name,s,tc,dur in EVS:
    r=[r for r in L if r["sector"]==s][0]
    for c in ["SAP_FLUX","KSPSAP_FLUX","DET_FLUX","SYS_RM_FLUX","KSPSAP_FLUX_SML","KSPSAP_FLUX_LAG"]:
        if c not in r: continue
        y=r[c].copy(); y[r["q"]!=0]=np.nan
        for order in [1,2]:
            res=measure(r["t"],y,tc,dur,win=1.0,order=order)
            if res is None or not np.isfinite(res.get("depth",np.nan)): continue
            rows.append(dict(event=name,sector=s,tc=tc,col=c,order=order,depth_ppt=round(res["depth"]*1e3,2),sig_white=round(res["sig_white"]*1e3,3),
              beta=round(res["beta"],2),sig_emp=round(res["sig_emp"]*1e3,3),sig_adopt=round(res["sig_adopt"]*1e3,3),snr=round(res["depth"]/res["sig_adopt"],1),
              frac_deeper=round(res["frac_deeper"],4),cov=round(res["cov"],2)))
            print(rows[-1],flush=True)
json.dump(rows,open("data/step2_archival.json","w"),indent=1)
