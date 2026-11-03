"""Depth at every epoch of the sweep ephemeris (P 15.9349, T0 1365.4069) in every product; plots of the two sweep events."""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, json
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
from hlsp import load
from measure import fit_depth
from common import P0, T00, DUR
L=load(); rows=[]
for r in L:
    t=r["t"]; g=r["good"]&np.isfinite(t)
    if g.sum()<50: continue
    k0=int(np.floor((t[g].min()-T00)/P0)); k1=int(np.ceil((t[g].max()-T00)/P0))
    for k in range(k0,k1+1):
        tc=T00+k*P0
        if not (t[g].min()<tc<t[g].max()): continue
        for c,y in r["cols"].items():
            if any(s in c for s in ["BKG","BGV","_X","_Y","CENTROID","background"]): continue
            yy=y.copy(); yy[~g]=np.nan
            w=np.isfinite(yy)&(np.abs(t-tc)<1.0)
            if w.sum()<15: continue
            res=fit_depth(t,yy/np.nanmedian(yy[w]),tc,DUR,1.0,2)
            if res is None or not np.isfinite(res.get("depth",np.nan)): continue
            rows.append(dict(author=r["author"],sector=r["sector"],epoch=k,tc=round(tc,3),col=c,depth_ppt=round(res["depth"]*1e3,2),
                             sig_ppt=round(res["sig_white"]*res["beta"]*1e3,2),cov=round(res["cov"],2)))
json.dump(rows,open("data/step2_look.json","w"),indent=1)
for x in rows:
    if x["col"] in ("SAP_FLUX","KSPSAP_FLUX","RAW_FLUX","CORR_FLUX","IRM2","TFA2","FLUX_RAW","cal_aper_flux","cal_psf_flux"): print(x)
fig,axs=plt.subplots(2,1,figsize=(11,8))
for a,s,k in [(axs[0],2,0),(axs[1],6,5)]:
    tc=T00+k*P0; off=0
    for r in L:
        if r["sector"]!=s: continue
        for c in [cc for cc in ["SAP_FLUX","KSPSAP_FLUX","RAW_FLUX","CORR_FLUX","IRM2","FLUX_RAW","cal_aper_flux"] if cc in r["cols"]]:
            t=r["t"]; y=r["cols"][c].copy(); g=r["good"]&(np.abs(t-tc)<2)&np.isfinite(y)
            if g.sum()<10: continue
            a.plot((t[g]-tc)*24,(y[g]/np.nanmedian(y[g])-1)*1e3-off,".",ms=3,label=f"{r['author']} {c}"); off+=25
    a.axvspan(-2,2,color="0.9"); a.set_title(f"S{s}, epoch {k}, tc {tc:.3f}",fontsize=9); a.legend(fontsize=6,ncol=3); a.set_xlabel("hours")
fig.tight_layout(); fig.savefig("figs/step2_sweep_events.png",dpi=100)
