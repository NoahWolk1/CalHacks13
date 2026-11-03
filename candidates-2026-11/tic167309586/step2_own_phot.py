"""Own aperture photometry from TESScut at each event: 2 apertures x 2 background methods, plus in-cutout comparison stars."""
import warnings; warnings.filterwarnings("ignore")
import json, glob, numpy as np
import lightkurve as lk
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
from astropy.coordinates import SkyCoord; import astropy.units as u
from scipy.ndimage import maximum_filter
from measure import measure
from common import EV, DUR, RA, DEC
def aperture(shape, x0, y0, r):
    Y, X = np.mgrid[: shape[0], : shape[1]]
    return (X - x0) ** 2 + (Y - y0) ** 2 <= r ** 2
results = {}
fig, axs = plt.subplots(len(EV), 1, figsize=(11, 3.2*len(EV)))
for ax_, (s, tc) in zip(axs, EV.items()):
    f = glob.glob(f"data/tesscut/**/tess-s{s:04d}*.fits", recursive=True)[0]
    tpf = lk.read(f); t = tpf.time.value; F = tpf.flux.value.astype(float); q = tpf.quality
    good = (q == 0) & np.all(np.isfinite(F), axis=(1, 2))
    med = np.nanmedian(F[good], axis=0)
    xt, yt = [float(v) for v in tpf.wcs.world_to_pixel(SkyCoord(RA * u.deg, DEC * u.deg))]
    Y, X = np.mgrid[:25, :25]; rr = np.hypot(X - xt, Y - yt)
    sky_g = med < np.nanpercentile(med, 40)
    ann = (rr > 5) & (rr < 9) & (med < np.nanpercentile(med[(rr > 5) & (rr < 9)], 60))
    res = dict(sector=s, tc=tc, target_px=[xt, yt], n_good=int(good.sum()), cadence_s=float(np.nanmedian(np.diff(t))*86400))
    lcs = {}
    for bname, skym in [("global40", sky_g), ("annulus", ann)]:
        bkg = np.nanmedian(F[:, skym], axis=1); Fb = F - bkg[:, None, None]
        for r_ap in [1.5, 2.5]:
            ap = aperture(med.shape, xt, yt, r_ap)
            lc = np.nansum(Fb[:, ap], axis=1); y = lc.copy(); y[~good] = np.nan
            m = measure(t, y, tc, DUR, win=1.0, order=2)
            key = f"{bname}_r{r_ap}"
            if m is None or not np.isfinite(m.get("depth", np.nan)):
                res[key] = None; continue
            res[key] = dict(depth_ppt=round(float(m["depth"]*1e3), 2), sig_adopt=round(float(m["sig_adopt"]*1e3), 2),
                            cov=round(float(m["cov"]), 2), frac_deeper=round(float(m["frac_deeper"]), 3))
            lcs[key] = (lc, m)
        if bname == "global40":
            apS = aperture(med.shape, xt, yt, 1.5); ev = np.abs(t - tc) < DUR/2
            res["bkg_over_star_in_event"] = round(float(np.nanmean(bkg[ev & good]) * apS.sum() / np.nanmedian(np.nansum(Fb[good][:, apS], axis=1))), 3)
            medb = np.nanmedian(Fb[good], axis=0)
            pk = (medb == maximum_filter(medb, size=5)) & (medb > 0.15 * medb[int(round(yt)), int(round(xt))])
            comps = []
            for yy, xx in zip(*np.where(pk)):
                if np.hypot(xx - xt, yy - yt) < 3 or min(xx, yy) < 3 or max(xx, yy) > 21: continue
                ap = aperture(medb.shape, xx, yy, 1.5); lc = np.nansum(Fb[:, ap], axis=1); y = lc.copy(); y[~good] = np.nan
                m = measure(t, y, tc, DUR, win=1.0, order=2)
                if m is None or not np.isfinite(m.get("depth", np.nan)): continue
                comps.append(dict(x=int(xx), y=int(yy), rel_bright=round(float(medb[yy, xx]/medb[int(round(yt)), int(round(xt))]), 3),
                                  depth_ppt=round(float(m["depth"]*1e3), 2), sig=round(float(m["sig_adopt"]*1e3), 2)))
            res["comparison_stars"] = comps
            bk = bkg
    w = np.abs(t - tc) < 1.5
    for k, off, col in [("global40_r1.5", 0, "k"), ("global40_r2.5", -6, "C0"), ("annulus_r2.5", -12, "C2")]:
        if k not in lcs: continue
        lc, m = lcs[k]; g_ = good & w
        ax_.plot(t[g_], (lc[g_]/np.nanmedian(lc[g_]) - 1)*1e3 + off, ".", ms=2, color=col, label=f"{k}: {m['depth']*1e3:.2f}±{m['sig_adopt']*1e3:.2f} ppt")
        ax_.plot(m["t"], (m["model"] - 1)*1e3 + off, "r-", lw=1)
    for tt in t[w & ((q & 32) > 0)]: ax_.axvline(tt, color="m", lw=.6)
    ax_.axvspan(tc - DUR/2, tc + DUR/2, color="orange", alpha=.2); ax_.legend(fontsize=7); ax_.set_ylabel("ppt")
    ax_.set_title(f"S{s} own TESScut photometry around BTJD {tc} (red: baseline+trapezoid fit)", fontsize=9)
    results[s] = res; print(json.dumps(res), flush=True)
axs[-1].set_xlabel("BTJD"); fig.tight_layout(); fig.savefig("figs/own_phot.png", dpi=100)
json.dump(results, open("data/step2_own_phot.json", "w"), indent=1)
