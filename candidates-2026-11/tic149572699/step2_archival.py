"""Depth of each event in every product/column covering it (q=0 only), plus a background-regressed version,
and a re-centring scan (tc, duration) on the primary column."""
import warnings, json, sys; warnings.filterwarnings("ignore")
import numpy as np
from lcio import load_all
from measure import measure, fit_depth
from common import EVENTS   # list of (name, tc, dur_days)
L=load_all()
COLS=["SAP_FLUX","PDCSAP_FLUX","KSPSAP_FLUX","DET_FLUX","SYS_RM_FLUX","KSPSAP_FLUX_SML","KSPSAP_FLUX_LAG"]
def bkg_regress(t,y,b,tc,dur,win=1.0):
    w=np.isfinite(y)&np.isfinite(b)&(np.abs(t-tc)<win); oot=w&(np.abs(t-tc)>dur/2+0.03)
    if oot.sum()<20: return None
    x=t-tc; bn=(b-np.nanmedian(b[w]))/np.nanmedian(y[w])
    A=np.vstack([np.ones_like(x),x,x**2,bn]).T
    c,*_=np.linalg.lstsq(A[oot],y[oot],rcond=None)
    yy=y-c[3]*bn
    return yy, c[3]
rows=[]
for name,tc,dur in EVENTS:
    for r in L:
        t=r["t"]
        if not (np.nanmin(t)-0.2<tc<np.nanmax(t)+0.2): continue
        for c in COLS:
            if c not in r: continue
            for qmode in ["q0","all"]:
                y=r[c].copy()
                if qmode=="q0": y[r["q"]!=0]=np.nan
                res=measure(t,y,tc,dur)
                row=dict(event=name,tc=tc,dur_h=round(dur*24,2),author=r["author"],sector=r["sector"],col=c,qual=qmode)
                if res is None or not np.isfinite(res.get("depth",np.nan)):
                    row["cov"]=None if res is None else round(float(res["cov"]),2); rows.append(row); continue
                row.update(depth_ppt=round(res["depth"]*1e3,2),sig_white=round(res["sig_white"]*1e3,2),beta=round(res["beta"],2),
                           sig_emp=round(res["sig_emp"]*1e3,2),sig_adopt=round(res["sig_adopt"]*1e3,2),snr=round(res["depth"]/res["sig_adopt"],1),
                           frac_deeper=round(float(res["frac_deeper"]),3),cov=round(float(res["cov"]),2))
                if "SAP_BKG" in r and c in ("SAP_FLUX","PDCSAP_FLUX","KSPSAP_FLUX","DET_FLUX","SYS_RM_FLUX"):
                    o=bkg_regress(t,y,r["SAP_BKG"],tc,dur)
                    if o is not None:
                        rb=measure(t,o[0],tc,dur)
                        if rb is not None and np.isfinite(rb.get("depth",np.nan)):
                            row.update(bkgreg_depth=round(rb["depth"]*1e3,2),bkgreg_sig=round(rb["sig_adopt"]*1e3,2),bkg_coef=round(float(o[1]),5))
                rows.append(row)
                print(row,flush=True)
json.dump(rows,open("data/step2_archival.json","w"),indent=1)
# re-centring on primary products
out={}
for name,tc,dur in EVENTS:
    for r in L:
        t=r["t"]
        if not (np.nanmin(t)<tc<np.nanmax(t)): continue
        c="SAP_FLUX"; y=r[c].copy(); y[r["q"]!=0]=np.nan; y=y/np.nanmedian(y[np.abs(t-tc)<1])
        best=None
        for d in np.arange(1.0,8.01,0.5)/24:
            for tt in np.arange(tc-0.25,tc+0.2501,0.005):
                f=fit_depth(t,y,tt,d,min_cov=0.6)
                if f is None or not np.isfinite(f.get("depth",np.nan)): continue
                s=f["depth"]/f["sig_white"]
                if best is None or s>best[0]: best=(s,tt,d,f["depth"],f["sig_white"])
        if best:
            out[f"{name}_{r['author']}_S{r['sector']}"]=dict(snr_white=round(best[0],1),tc=round(best[1],4),dur_h=round(best[2]*24,1),depth_ppt=round(best[3]*1e3,2),sig_white=round(best[4]*1e3,2))
            print("RECENTRE",name,r["author"],r["sector"],out[f"{name}_{r['author']}_S{r['sector']}"],flush=True)
json.dump(out,open("data/step2_recentre.json","w"),indent=1)
