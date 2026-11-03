"""QLP S2 around the two sweep epochs: outlier-clipped depths, quality flags, background level and slope, orbit edges,
and the flux-background relation. Also the S6 epoch at 1476.951 (gap edge)."""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, json
from hlsp import load
from measure import measure
from common import P0,T00,DUR
out={}
for r in load():
    if r["author"]!="QLP" or r["sector"] not in (2,6): continue
    t=r["t"]; q=~r["good"]; c=r["cols"]
    for k in ([0,1] if r["sector"]==2 else [7]):
        tc=T00+k*P0; R={}
        for col in ["SAP_FLUX","KSPSAP_FLUX","KSPSAP_FLUX_SML","KSPSAP_FLUX_LAG"]:
            y=c[col].copy(); y[q]=np.nan
            w=np.abs(t-tc)<1; md=np.nanmedian(y[w]); y=y/md
            # clip single-cadence outliers (>8 MAD from a 5-point running median)
            from scipy.ndimage import median_filter
            ok=np.isfinite(y); ys=y.copy(); ys[ok]=median_filter(y[ok],5); d=y-ys; mad=1.4826*np.nanmedian(np.abs(d[w]))
            nclip=int((np.abs(d[w])>8*mad).sum()); y[np.abs(d)>8*mad]=np.nan
            m=measure(t,y,tc,DUR,1.0,2)
            R[col]=None if (m is None or not np.isfinite(m.get("depth",np.nan))) else dict(depth_ppt=round(m["depth"]*1e3,2),sig_ppt=round(m["sig_adopt"]*1e3,2),beta=round(m["beta"],2),frac_deeper=round(m["frac_deeper"],3),n_clipped=nclip)
        g=~q; w=g&(np.abs(t-tc)<1); inb=g&(np.abs(t-tc)<DUR/2)
        bk=c["SAP_BKG"]; fl=c["SAP_FLUX"]
        R["flagged_cadences_in_pm1d"]=int((q&(np.abs(t-tc)<1)).sum()); R["flagged_in_box"]=int((q&(np.abs(t-tc)<DUR/2)).sum())
        R["bkg_in_box_med"]=float(np.nanmedian(bk[inb])); R["bkg_pm1d_min_max"]=[float(np.nanmin(bk[w])),float(np.nanmax(bk[w]))]
        R["bkg_slope_in_box_e_per_s_per_h"]=float(np.polyfit((t[inb]-tc)*24,bk[inb],1)[0]) if inb.sum()>3 else None
        R["sap_flux_median_e"]=float(np.nanmedian(fl[w]))
        R["corr_flux_bkg_pm1d"]=float(np.corrcoef(fl[w&np.isfinite(fl)&np.isfinite(bk)],bk[w&np.isfinite(fl)&np.isfinite(bk)])[0,1])
        tg=t[g]; R["dist_to_data_edge_d"]=float(min(abs(tc-tg[tg<tc].max()) if (tg<tc).any() else 99, abs(tg[tg>tc].min()-tc) if (tg>tc).any() else 99))
        gaps=[(round(tg[i],3),round(tg[i+1],3)) for i in np.where(np.diff(tg)>0.3)[0]]
        R["gaps_in_sector"]=gaps
        out[f"S{r['sector']}_ep{k}_{tc:.3f}"]=R; print(f"S{r['sector']} ep{k} tc {tc:.3f}",json.dumps(R))
json.dump(out,open("data/step3_flags.json","w"),indent=1)
