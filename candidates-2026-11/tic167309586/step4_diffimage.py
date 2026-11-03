"""Per-pixel transit-depth ("difference") images with detrending, Gaia overlay, centroid offset.

For every pixel, the background-subtracted time series in tc±1 d (quality==0) is fit with the same
design matrix as the photometry: per-segment quadratic baseline + trapezoid (7.2 h).
The trapezoid coefficient A_ij [e-/s] is the flux lost in transit in that pixel (= OOT - IT,
with trends removed). Per-pixel errors come from residual RMS x Pont beta.
Centroid of A is fit with a Gaussian PSF whose width is fixed from the direct image; uncertainty from a
parametric bootstrap (A + N(0, sigma_ij)). Also tracks the per-cadence PSF centroid of the target.
"""
import warnings; warnings.filterwarnings("ignore")
import json, glob, numpy as np
import lightkurve as lk
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
from astropy.coordinates import SkyCoord; import astropy.units as u
from astropy.table import Table
from scipy.optimize import least_squares
from measure import trapezoid, segments

from common import RA, DEC
PIX = 21.0
DUR = 8/24.
EV = {s: dict(tc=tc, f=glob.glob(f"data/tesscut/**/tess-s{s:04d}*.fits", recursive=True)[0], ep=2016.0+(tc+2457000-2457389.0)/365.25)
      for s, tc in {4: 1416.784, 37: 2325.862, 67: 3150.98, 90: 3767.99}.items()}
gaia = Table.read("data/gaia_2arcmin.csv")
rng = np.random.default_rng(2)


def gauss(p, X, Y):
    a, x0, y0, s, c = p
    return a * np.exp(-((X - x0) ** 2 + (Y - y0) ** 2) / (2 * s ** 2)) + c


def fit(img, x0, y0, s0=None, w=None, half=3):
    xi, yi = int(round(x0)), int(round(y0))
    sl = (slice(yi - half, yi + half + 1), slice(xi - half, xi + half + 1))
    Y, X = np.mgrid[sl]; d = img[sl]; ww = 1.0 if w is None else w[sl]
    if s0 is None:
        r = least_squares(lambda p: ((gauss(p, X, Y) - d) * ww).ravel(), [d.max(), x0, y0, .7, 0]).x
        return r
    r = least_squares(lambda p: ((gauss([p[0], p[1], p[2], s0, p[3]], X, Y) - d) * ww).ravel(), [d.max(), x0, y0, 0]).x
    return np.array([r[0], r[1], r[2], s0, r[3]])


def design(t, tc):
    s = trapezoid(t, tc, DUR)
    cols = [s]
    for idx in segments(t):
        ts = t[idx]; span = ts.max() - ts.min()
        o = 2 if span > 0.8 else (1 if span > 0.3 else 0)
        for k in range(o + 1):
            c = np.zeros_like(t); c[idx] = (ts - tc) ** k; cols.append(c)
    return np.vstack(cols).T, s


out = {}
for s, ev in EV.items():
    tc = ev["tc"]
    tpf = lk.read(ev["f"])
    t = tpf.time.value; F = tpf.flux.value.astype(float); q = tpf.quality
    good = (q == 0) & np.all(np.isfinite(F), axis=(1, 2))
    med = np.nanmedian(F[good], axis=0); sky = med < np.nanpercentile(med, 40)
    bkg = np.nanmedian(F[:, sky], axis=1); Fb = F - bkg[:, None, None]
    img = np.nanmedian(Fb[good], axis=0)
    w = good & (np.abs(t - tc) < 1.0)
    tw = t[w]; Y = Fb[w].reshape(w.sum(), -1)
    A, sh = design(tw, tc)
    coef, *_ = np.linalg.lstsq(A, Y, rcond=None)
    resid = Y - A @ coef
    rms = resid.std(0)
    cov00 = np.linalg.pinv(A.T @ A)[0, 0]
    # Pont beta per pixel at bin ~ dur/2
    dt = np.median(np.diff(tw)); nb = max(int(DUR / 2 / dt), 2); nbin = len(tw) // nb
    rb = resid[: nbin * nb].reshape(nbin, nb, -1).mean(1)
    beta = np.clip(rb.std(0) / (rms / np.sqrt(nb) * np.sqrt(nbin / (nbin - 1))), 1, None)
    depth_img = -coef[0].reshape(img.shape)           # e-/s lost in transit (positive = flux loss)
    sig_img = (rms * np.sqrt(cov00) * beta).reshape(img.shape)
    xt, yt = [float(v) for v in tpf.wcs.world_to_pixel(SkyCoord(RA * u.deg, DEC * u.deg))]
    p_img = fit(img, xt, yt)
    p_dep = fit(depth_img, p_img[1], p_img[2], s0=p_img[3], w=1 / sig_img)
    boots = []
    for _ in range(500):
        pb = fit(depth_img + rng.normal(0, sig_img), p_img[1], p_img[2], s0=p_img[3], w=1 / sig_img)
        boots.append(pb[:3])
    boots = np.array(boots)
    sx, sy = boots[:, 1].std(), boots[:, 2].std()
    dx, dy = p_dep[1] - p_img[1], p_dep[2] - p_img[2]
    # total depth in a 2.5-px aperture & SNR, plus depth expected in pixels if the target is the source
    yi, xi = np.mgrid[: img.shape[0], : img.shape[1]]
    ap = (xi - p_img[1]) ** 2 + (yi - p_img[2]) ** 2 <= 2.5 ** 2
    tot = depth_img[ap].sum(); tot_sig = np.sqrt((sig_img[ap] ** 2).sum())
    depth_ppt = tot / img[ap].sum() * 1e3
    # Gaia, propagated to epoch, tied to target PSF fit
    gx, gy = [], []
    for g in gaia:
        pmra = 0. if np.ma.is_masked(g["pmra"]) else float(g["pmra"]); pmde = 0. if np.ma.is_masked(g["pmdec"]) else float(g["pmdec"])
        dyr = ev["ep"] - 2016.0
        c = SkyCoord((g["ra"] + pmra * dyr / 3.6e6 / np.cos(np.radians(g["dec"]))) * u.deg, (g["dec"] + pmde * dyr / 3.6e6) * u.deg)
        a_, b_ = tpf.wcs.world_to_pixel(c); gx.append(float(a_)); gy.append(float(b_))
    gx = np.array(gx); gy = np.array(gy)
    wcs_err = np.hypot(gx[0] - p_img[1], gy[0] - p_img[2]) * PIX
    gx += p_img[1] - gx[0]; gy += p_img[2] - gy[0]
    sig_r = np.sqrt((sx ** 2 + sy ** 2) / 2) * PIX
    dist = np.hypot(gx - p_dep[1], gy - p_dep[2]) * PIX
    near = [dict(source_id=str(gaia["source_id"][i]), G=round(float(gaia["phot_g_mean_mag"][i]), 2),
                 sep_from_target=round(float(gaia["sep"][i]), 1), dist_from_centroid=round(float(dist[i]), 1),
                 n_sigma=round(float(np.hypot((gx[i] - p_dep[1]) / sx, (gy[i] - p_dep[2]) / sy)), 1))
            for i in np.argsort(dist)[:6]]
    # per-cadence target centroid (flux-weighted 5x5) to show pointing behaviour
    yc, xc = int(round(p_img[2])), int(round(p_img[1]))
    st = Fb[:, yc - 2:yc + 3, xc - 2:xc + 3]
    Yg, Xg = np.mgrid[yc - 2:yc + 3, xc - 2:xc + 3]
    cx = (st * Xg).sum((1, 2)) / st.sum((1, 2)); cy = (st * Yg).sum((1, 2)) / st.sum((1, 2))
    # does the depth image look like a PSF (flux loss) or a dipole (shift)?
    model_psf = gauss(p_dep, xi, yi) - p_dep[4]
    chi_psf = np.nansum(((depth_img - model_psf) / sig_img)[ap] ** 2)
    chi_null = np.nansum((depth_img / sig_img)[ap] ** 2)
    res = dict(sector=s, tc=tc, n_fit_cadences=int(w.sum()), psf_sigma_px=round(float(p_img[3]), 3),
               wcs_vs_psf_fit_arcsec=round(float(wcs_err), 1),
               aperture_depth_ppt=round(float(depth_ppt), 2), aperture_depth_sig_ppt=round(float(tot_sig / img[ap].sum() * 1e3), 2),
               depth_image_snr=round(float(tot / tot_sig), 1),
               offset_px=[round(float(dx), 3), round(float(dy), 3)], offset_sig_px=[round(float(sx), 3), round(float(sy), 3)],
               offset_arcsec=round(float(np.hypot(dx, dy) * PIX), 1), offset_sig_arcsec=round(float(sig_r), 1),
               offset_nsigma=round(float(np.hypot(dx / sx, dy / sy)), 1),
               chi2_null=round(float(chi_null), 1), chi2_psf=round(float(chi_psf), 1), n_ap_pix=int(ap.sum()),
               nearest_gaia=near)
    out[s] = res
    print(json.dumps(res, indent=1))

    fig, ax = plt.subplots(1, 3, figsize=(17, 5.6))
    z = 6; x0, y0 = int(round(p_img[1])), int(round(p_img[2]))
    G = np.array(gaia["phot_g_mean_mag"]); sz = np.clip((21 - G) * 14, 6, 300)
    for a, im_, ttl, cm in [(ax[0], img, "median image (bkg-sub) [e-/s]", "viridis"),
                            (ax[1], depth_img, "per-pixel transit depth A (OOT−IT, detrended) [e-/s]", "RdBu_r"),
                            (ax[2], depth_img / sig_img, "A / σ_A", "RdBu_r")]:
        sub = im_[y0 - z:y0 + z + 1, x0 - z:x0 + z + 1]; vm = np.nanmax(np.abs(sub))
        h = a.imshow(im_, origin="lower", cmap=cm, vmin=None if cm == "viridis" else -vm, vmax=None if cm == "viridis" else vm)
        plt.colorbar(h, ax=a, fraction=.046)
        ec = "w" if cm == "viridis" else "k"
        a.scatter(gx, gy, s=sz, facecolors="none", edgecolors=ec, lw=.8)
        for i in np.where(G < 18.7)[0]:
            a.annotate(f"G{G[i]:.1f}", (gx[i], gy[i]), fontsize=6, color=ec, xytext=(3, 3), textcoords="offset points")
        a.plot(p_img[1], p_img[2], "r+", ms=16, mew=2, label="target (PSF fit)")
        a.errorbar(p_dep[1], p_dep[2], xerr=sx, yerr=sy, fmt="mx", ms=10, mew=2, capsize=3, label="depth-image centroid ±1σ")
        a.add_patch(plt.Circle((p_img[1], p_img[2]), 120 / PIX, fill=False, ls="--", color="orange"))
        a.set_xlim(x0 - z - .5, x0 + z + .5); a.set_ylim(y0 - z - .5, y0 + z + .5); a.set_title(ttl, fontsize=9)
        a.set_xlabel("column (px, 21\"/px)"); a.set_ylabel("row")
    ax[0].legend(fontsize=7, loc="lower left")
    fig.suptitle(f"S{s} BTJD {tc}: depth in r=2.5 px {res['aperture_depth_ppt']} ± {res['aperture_depth_sig_ppt']} ppt "
                 f"(SNR {res['depth_image_snr']}); centroid offset {res['offset_arcsec']} ± {res['offset_sig_arcsec']}\" "
                 f"({res['offset_nsigma']}σ). Circles: Gaia DR3 (size∝brightness); dashed: 2'", fontsize=10)
    fig.tight_layout(); fig.savefig(f"figs/diffimage_s{s}.png", dpi=110); plt.close(fig)

    fig, ax = plt.subplots(3, 1, figsize=(10, 7), sharex=True)
    ww = np.abs(t - tc) < 1.5
    ax[0].plot(t[ww], (cx[ww] - np.nanmedian(cx[ww])) * PIX, ".", ms=2); ax[0].set_ylabel("Δcol centroid [\"]")
    ax[1].plot(t[ww], (cy[ww] - np.nanmedian(cy[ww])) * PIX, ".", ms=2); ax[1].set_ylabel("Δrow centroid [\"]")
    ax[2].plot(t[ww], bkg[ww], ".", ms=2, color="gray"); ax[2].set_ylabel("bkg [e-/s/px]")
    for a in ax: a.axvspan(tc - DUR / 2, tc + DUR / 2, color="orange", alpha=.25)
    ax[2].set_xlabel("BTJD"); fig.suptitle(f"S{s}: target flux-weighted centroid & background (TESScut)")
    fig.tight_layout(); fig.savefig(f"figs/centroid_s{s}.png", dpi=110); plt.close(fig)

json.dump(out, open("data/step4_diffimage.json", "w"), indent=1)
