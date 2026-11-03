import warnings; warnings.filterwarnings("ignore")
import numpy as np, json, glob
from astropy.io import fits
from lcio import load_all
from measure import measure
TC, DUR = 1426.302, 0.125
rows = []
def add(name, t, y, q):
    for qmode in ["q==0", "all finite"]:
        m = (q == 0) if qmode == "q==0" else np.ones(len(t), bool)
        yy = np.where(m, y, np.nan)
        r = measure(t, yy, TC, DUR, win=1.0, order=2)
        if r is None or not np.isfinite(r.get("depth", np.nan)):
            rows.append(dict(product=name, q=qmode, depth_ppt=None, cov=None if r is None else round(r["cov"], 2))); continue
        rows.append(dict(product=name, q=qmode, depth_ppt=round(r["depth"]*1e3, 2), sig_white=round(r["sig_white"]*1e3, 2),
                         sig_adopt=round(r["sig_adopt"]*1e3, 2), snr=round(r["depth"]/r["sig_adopt"], 1), cov=round(r["cov"], 2),
                         frac_deeper=round(float(r["frac_deeper"]), 3)))
for r in [r for r in load_all() if r["sector"] == 4]:
    for c in ["SAP_FLUX", "PDCSAP_FLUX", "KSPSAP_FLUX", "DET_FLUX"]:
        if c in r: add(f"{r['author']} {c}", r["t"], r[c], r["q"])
for f in sorted(glob.glob("data/lc_hlsp/**/*s0004*.fits", recursive=True) + glob.glob("data/lc_hlsp/**/*-s0004-*.fits", recursive=True)):
    try: h = fits.open(f)
    except Exception as e: print("unreadable", f, e); continue
    d = h[1].data; cols = d.columns.names
    t = np.array(d["TIME"] if "TIME" in cols else d["time"], float)
    q = np.array(d["QUALITY"] if "QUALITY" in cols else d["TESS_flags"], int)
    tag = "ELEANOR-LITE" if "eleanor" in f else "TGLC" if "tglc" in f else ("TASOC-ens" if "ens-lc" in f else "TASOC-cbv") if "tasoc" in f else f
    for c in ["RAW_FLUX", "CORR_FLUX", "FLUX_RAW", "FLUX_CORR", "aperture_flux", "psf_flux", "cal_aper_flux", "cal_psf_flux"]:
        if c in cols:
            y = np.array(d[c], float)
            if tag.startswith("TASOC") and c == "FLUX_CORR": y = 1 + y * 1e-6 if np.nanmedian(np.abs(y)) < 1e5 else y  # ppm
            add(f"{tag} {c}", t, y, q)
seen = set(); out = []
for x in rows:
    k = (x["product"], x["q"])
    if k in seen: continue
    seen.add(k); out.append(x); print(x)
json.dump(out, open("data/step2_archival.json", "w"), indent=1)
