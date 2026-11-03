"""PDC correction (PDCSAP/SAP) around each event, for SPOC 2-min and TESS-SPOC FFI; plus a +-0.6 d mid-time scan."""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, json, matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
from lcio import load_all
from measure import fit_depth
from common import EV, DUR
L=load_all(); out=[]
fig,axs=plt.subplots(4,2,figsize=(14,12))
for i,(s,tc) in enumerate(EV.items()):
    for r in [r for r in L if r["sector"]==s and r["author"] in ("SPOC","TESS-SPOC")]:
        t=r["t"]; sap=r["SAP_FLUX"]; pdc=r["PDCSAP_FLUX"]; g=np.isfinite(sap)&np.isfinite(pdc)&(r["q"]==0)
        w=lambda a,b: g&(t>a)&(t<b)
        ratio=pdc/sap; ratio=ratio/np.nanmedian(ratio[w(tc-1.5,tc+1.5)])
        c=(ratio-1)*1e3
        h=r["hdr1"]
        rec=dict(sector=s,author=r["author"],CROWDSAP=h.get("CROWDSAP"),FLFRCSAP=h.get("FLFRCSAP"),PDCMETHD=h.get("PDCMETHD"),
                 corr_in=round(float(np.nanmean(c[w(tc-DUR/2,tc+DUR/2)])),2),
                 corr_before=round(float(np.nanmean(c[w(tc-DUR/2-0.5,tc-DUR/2)])),2),
                 corr_after=round(float(np.nanmean(c[w(tc+DUR/2,tc+DUR/2+0.5)])),2) if w(tc+DUR/2,tc+DUR/2+0.5).sum() else None)
        # corrected-minus-raw: fit the trapezoid to the correction itself
        fr=fit_depth(t[g],ratio[g],tc,DUR,win=1.0,order=2)
        rec["trapezoid_fit_to_correction_ppt"]=round(float(fr["depth"]*1e3),2) if fr and np.isfinite(fr.get("depth",np.nan)) else None
        # tc scan
        for col in ["SAP_FLUX","PDCSAP_FLUX"]:
            y=r[col].copy(); y[~g]=np.nan; y=y/np.nanmedian(y)
            best=(None,-9)
            for tt in np.arange(tc-0.6,tc+0.6,0.01):
                fr=fit_depth(t,y,tt,DUR,win=1.0,order=2)
                if fr and np.isfinite(fr.get("depth",np.nan)) and fr["depth"]>best[1]: best=(round(tt,3),fr["depth"])
            rec[f"scan_max_{col}"]=[best[0],round(best[1]*1e3,2)]
        out.append(rec); print(rec)
        a=axs[i,0 if r["author"]=="SPOC" else 1]; ww=w(tc-2,tc+2)
        a.plot(t[ww],(sap[ww]/np.nanmedian(sap[ww])-1)*1e3,".",ms=1,color="0.5",label="SAP")
        a.plot(t[ww],(pdc[ww]/np.nanmedian(pdc[ww])-1)*1e3-8,".",ms=1,color="C0",label="PDCSAP − 8")
        a.plot(t[ww],c[ww]-16,".",ms=1,color="C3",label="PDCSAP/SAP − 16")
        for tt in t[(np.abs(t-tc)<2)&((r["q"]&32)>0)]: a.axvline(tt,color="m",lw=.6)
        a.axvspan(tc-DUR/2,tc+DUR/2,color="orange",alpha=.25); a.set_title(f"S{s} {r['author']}: correction in-event {rec['corr_in']} ppt",fontsize=9)
        a.set_ylabel("ppt"); a.legend(fontsize=6,loc="lower left")
for a in axs[2:3,0]: a.text(.5,.5,"no SPOC 2-min in S67",transform=a.transAxes,ha="center")
fig.tight_layout(); fig.savefig("figs/pdc_correction.png",dpi=100)
json.dump(out,open("data/step2_pdc.json","w"),indent=1)
