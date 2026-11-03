"""Depth of both events in every product/column, 3 baselines, quality masks; plus a re-centring grid (tc, duration)."""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, json
from lcio import load_all
from measure import measure, fit_depth
from cfg import *
rows=[]
for tc in [TC,TC2]:
    for r in load_all():
        if not (r["t"].min()<tc<r["t"].max()): continue
        for c in ["SAP_FLUX","KSPSAP_FLUX","DET_FLUX","RAW_FLUX","CORR_FLUX","PCA_FLUX","FLUX_RAW","FLUX_CORR"]:
            if c not in r: continue
            for qmode in ["q==0","all"]:
                m=(r["q"]==0) if qmode=="q==0" else np.ones_like(r["q"],bool)
                y=r[c].copy(); y[~m]=np.nan
                if c=="FLUX_CORR" and np.nanmedian(y)<100: y=1+y*1e-6   # TASOC corrected flux is in ppm
                for win,order in [(1.0,2),(0.75,1),(1.5,2)]:
                    res=measure(r["t"],y,tc,DUR,win=win,order=order)
                    row=dict(event=tc,author=r["author"],sector=r["sector"],col=c,q=qmode,win=win,order=order)
                    if res is None or not np.isfinite(res.get("depth",np.nan)): rows.append(row|dict(depth_ppt=None)); continue
                    rows.append(row|dict(depth_ppt=round(res["depth"]*1e3,2),sig_white=round(res["sig_white"]*1e3,2),beta=round(res["beta"],2),
                        sig_emp=round(res["sig_emp"]*1e3,2),sig_adopt=round(res["sig_adopt"]*1e3,2),snr=round(res["depth"]/res["sig_adopt"],1),
                        frac_deeper=round(res["frac_deeper"],3),cov=round(res["cov"],2),rms_ppt=round(res["rms"]*1e3,1)))
for x in rows:
    if x["q"]=="q==0" or x["author"]!="QLP": print({k:v for k,v in x.items() if k not in ("sig_white",)})
# re-centre on QLP (KSPSAP for S1, DET for S63) and SAP
rc={}
for tc in [TC,TC2]:
    for r in load_all(authors=["QLP"]):
        if not (r["t"].min()<tc<r["t"].max()): continue
        for c in ["SAP_FLUX","KSPSAP_FLUX","DET_FLUX"]:
            if c not in r: continue
            y=r[c].copy(); y[r["q"]!=0]=np.nan; y=y/np.nanmedian(y)
            best=None
            for d in np.arange(0.1,0.46,0.02):
                for t0 in np.arange(tc-0.2,tc+0.2,0.005):
                    f=fit_depth(r["t"],y,t0,d,1.0,2)
                    if f is None or not np.isfinite(f.get("depth",np.nan)): continue
                    s=f["depth"]/f["sig_white"]
                    if best is None or s>best[0]: best=(s,t0,d,f["depth"])
            rc[f"{tc}_{c}"]=dict(snr_white=round(best[0],1),tc=round(best[1],3),dur_h=round(best[2]*24,1),depth_ppt=round(best[3]*1e3,2)); print("recentre",tc,c,rc[f"{tc}_{c}"])
json.dump(dict(rows=rows,recentre=rc),open("data/step2_archival.json","w"),indent=1,default=float)
