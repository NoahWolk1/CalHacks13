"""Inject a 1.14 ppt, 8 h box-ish transit into own r=2.5 px photometry and SPOC/TESS-SPOC SAP at each epoch; recover. Also +-0.6 d tc scan of own photometry."""
import warnings; warnings.filterwarnings("ignore")
import json, glob, numpy as np, lightkurve as lk
from astropy.coordinates import SkyCoord; import astropy.units as u
from measure import measure, trapezoid, fit_depth
from common import EV, DUR, RA, DEC
from lcio import load_all
L=load_all(); out={}
for s, tc in EV.items():
    f = glob.glob(f"data/tesscut/**/tess-s{s:04d}*.fits", recursive=True)[0]
    tpf = lk.read(f); t = tpf.time.value; F = tpf.flux.value.astype(float); q = tpf.quality
    good = (q == 0) & np.all(np.isfinite(F), axis=(1, 2)); med = np.nanmedian(F[good], axis=0)
    bkg = np.nanmedian(F[:, med < np.nanpercentile(med, 40)], axis=1); Fb = F - bkg[:, None, None]
    xt, yt = [float(v) for v in tpf.wcs.world_to_pixel(SkyCoord(RA*u.deg, DEC*u.deg))]
    Y, X = np.mgrid[:25, :25]; ap = np.hypot(X-xt, Y-yt) <= 2.5
    lc = np.nansum(Fb[:, ap], axis=1); lc[~good] = np.nan; lc = lc/np.nanmedian(lc)
    series = {"own_r2.5": (t, lc)}
    for r in [r for r in L if r["sector"] == s and r["author"] in ("SPOC", "TESS-SPOC")]:
        y = r["SAP_FLUX"].copy(); y[r["q"] != 0] = np.nan; series[f"{r['author']}_SAP"] = (r["t"], y/np.nanmedian(y))
    rec = {}
    for name, (tt, y) in series.items():
        m0 = measure(tt, y, tc, DUR); 
        inj = y*(1 - 1.14e-3*trapezoid(tt, tc, DUR, ingress_frac=0.15))
        m1 = measure(tt, inj, tc, DUR)
        scan = []
        for x in np.arange(tc-0.6, tc+0.61, 0.02):
            fr = fit_depth(tt, y, x, DUR, win=1.0, order=2)
            if fr and np.isfinite(fr.get("depth", np.nan)): scan.append((round(x, 2), round(fr["depth"]*1e3, 2)))
        mx = max(scan, key=lambda z: z[1])
        rec[name] = dict(native=round(m0["depth"]*1e3, 2), injected_1p14=round(m1["depth"]*1e3, 2), sig=round(m1["sig_adopt"]*1e3, 2),
                         recovered_minus_native=round((m1["depth"]-m0["depth"])*1e3, 2), snr_of_injection=round((m1["depth"]-m0["depth"])/m1["sig_adopt"], 1),
                         scan_max=mx)
    out[s] = rec; print(s, json.dumps(rec), flush=True)
json.dump(out, open("data/step2_injection.json", "w"), indent=1)
