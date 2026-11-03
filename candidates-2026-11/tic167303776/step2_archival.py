"""Depth of the 1456.31 event in every S5 product, with a re-centred tc/duration (measure.py trapezoid, ±0.75 d quadratic)."""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, json
from lcio import load_all
from measure import measure
TC=1456.31
rows=[]
cols=["SAP_FLUX","PDCSAP_FLUX","FLUX","FLUX_RAW","FLUX_CORR","RAW_FLUX","CORR_FLUX","PCA_FLUX","cal_aper_flux","aperture_flux","psf_flux","cal_psf_flux"]
import glob
from astropy.io import fits
for f in sorted(glob.glob("data/lc/**/*s0005*.fits",recursive=True))+sorted(glob.glob("data/lc/**/*s0005*/*.fits",recursive=True)):
    pass
seen=set()
for f in sorted(set(glob.glob("data/lc/**/*.fits",recursive=True))):
    if "s0005" not in f and "s5_" not in f.lower() and "-s0005-" not in f: continue
    h=fits.open(f); d=h[1].data
    if d is None: continue
    names=d.columns.names; tcol="TIME" if "TIME" in names else ("time" if "time" in names else None)
    if tcol is None: continue
    t=np.array(d[tcol],float)
    q=np.array(d["QUALITY"],int) if "QUALITY" in names else (np.array(d["TESS_flags"],int) if "TESS_flags" in names else np.zeros(len(t),int))
    for c in names:
        if c.upper() not in [x.upper() for x in cols]: continue
        y=np.array(d[c],float); ok=np.isfinite(y)&np.isfinite(t)&(q==0)
        if ok.sum()<100: continue
        tt,yy=t[ok],y[ok]
        best=None
        for tc in np.arange(TC-0.05,TC+0.05,0.0025):
            for dur in [0.10,0.125,0.15,0.1667,0.2,0.25]:
                r=measure.__wrapped__(tt,yy,tc,dur) if hasattr(measure,"__wrapped__") else None
                break
            break
        # grid re-centre with cheap fit (no empirical sigma), then full measure at best
        from measure import fit_depth
        yn=yy/np.nanmedian(yy[np.abs(tt-TC)<0.75]); bb=None
        for tc in np.arange(TC-0.05,TC+0.05,0.0025):
            for dur in [0.10,0.125,0.15,0.1667,0.2,0.25]:
                r=fit_depth(tt,yn,tc,dur,0.75,2)
                if r is None or not np.isfinite(r["depth"]): continue
                chi=np.sum((r["f"]-r["model"])**2)
                if bb is None or chi<bb[0]: bb=(chi,tc,dur)
        r=measure(tt,yy,bb[1],bb[2],0.75,2); r0=measure(tt,yy,TC,1/6,0.75,2)
        tag=f.split("/")[-1][:60]
        rows.append(dict(file=tag,col=c,n=int(ok.sum()),depth_ppt_at_vet_4h=round(r0["depth"]*1e3,1),tc_best=round(bb[1],4),dur_best_h=round(bb[2]*24,2),depth_ppt_best=round(r["depth"]*1e3,1),
                         sig_adopt_ppt=round(r["sig_adopt"]*1e3,1),beta=round(r["beta"],2),sig_emp=round(r["sig_emp"]*1e3,1),frac_deeper=round(r["frac_deeper"],3),
                         min_flux_ppt=round((1-np.min(yn[np.abs(tt-bb[1])<0.1]))*1e3,1)))
        print(rows[-1])
json.dump(rows,open("data/step2_archival.json","w"),indent=1)
