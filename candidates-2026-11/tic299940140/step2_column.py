"""Pixel-level test: is the S4 dip a column artifact next to a bad CCD column?"""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, glob, json
from astropy.io import fits
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
from measure import measure
from lcio import load_all
TC, DUR = 1426.302, 0.125
f = glob.glob("data/tesscut/**/tess-s0004*.fits", recursive=True)[0]
h = fits.open(f); d = h[1].data
F = d["FLUX"].astype(float); t = d["TIME"].astype(float); q = d["QUALITY"]
good = (q == 0) & np.isfinite(t)
ny, nx = F.shape[1:]; yc, xc = 10, 10   # target pixel (cutout centre)
R = np.nanmedian(F[good], axis=0)
offrows = np.abs(np.arange(ny) - yc) > 3
# per-column additive offset per cadence, from rows away from the target
off = np.nanmedian((F - R)[:, offrows, :], axis=1)     # (nt, nx)
res = {}
res["median_image_row10"] = [round(float(v), 1) for v in R[yc]]
i0 = np.argmin(np.abs(t - 1426.2812))
res["frame_1426.2812_minus_ref_col_offsets"] = [round(float(v), 1) for v in off[i0]]
# uniformity of the deficit along col 10 at that cadence (all rows)
dcol = (F[i0] - R)[:, 10]
res["col10_deficit_all_rows_1426.2812"] = dict(median=float(np.median(dcol)), std=float(np.std(dcol)), min=float(dcol.min()), max=float(dcol.max()))
dcol11 = (F[i0] - R)[:, 11]
res["col11_deficit_all_rows_1426.2812"] = dict(median=float(np.median(dcol11)), star_rows_9to11=[float(x) for x in dcol11[9:12]])
# background: sky pixels (faint, not in cols 9-10)
sky = (R < np.nanpercentile(R, 40)); sky[:, 8:11] = False
bkg = np.nanmedian(F[:, sky], axis=1)
Fb = F - bkg[:, None, None]
Fc = F - off[:, None, :]           # column-offset corrected (no separate bkg needed: offset includes sky changes)
Y, X = np.mgrid[:ny, :nx]
def ap(r, x0=10.3, y0=10.0): return ((X - x0)**2 + (Y - y0)**2 <= r**2) & (X != 9)
aps = {"r1.5 (incl. col 10, bad col 9 masked)": (Fb, ap(1.5)), "r2.5 (incl. col 10, bad col 9 masked)": (Fb, ap(2.5)),
       "SPOC-like cols 10-11 rows 9-11": (Fb, (X >= 10) & (X <= 11) & (Y >= 9) & (Y <= 11)),
       "cols 11-12 only (excl. col 10)": (Fb, (X >= 11) & (X <= 12) & (Y >= 8) & (Y <= 12)),
       "column-corrected r1.5": (Fc, ap(1.5)), "column-corrected cols 10-11 rows 9-11": (Fc, (X >= 10) & (X <= 11) & (Y >= 9) & (Y <= 11))}
lcs = {}
res["own_phot"] = {}
for name, (cube, m) in aps.items():
    lc = np.nansum(cube[:, m], axis=1); y = lc.copy(); y[~good] = np.nan
    mm = measure(t, y, TC, DUR, win=1.0, order=2)
    lcs[name] = lc
    res["own_phot"][name] = dict(npix=int(m.sum()), depth_ppt=round(mm["depth"]*1e3, 2), sig_adopt=round(mm["sig_adopt"]*1e3, 2),
                                 cov=round(mm["cov"], 2), frac_deeper=round(float(mm["frac_deeper"]), 3))
# compare SPOC SAP with 3 x col-10 offset over the sector
sp = [r for r in load_all() if r["sector"] == 4 and r["author"] == "TESS-SPOC"][0]
ts, sap = sp["t"], sp["SAP_FLUX"]
o10 = np.interp(ts, t, off[:, 10]); o11 = np.interp(ts, t, off[:, 11])
gs = np.isfinite(sap) & np.isfinite(ts) & (ts > 1424.5) & (sp["q"] == 0) & np.isfinite(o10)
base = np.nanmedian(sap[gs])
dev = sap - base
pred = 3 * o10 + 3 * o11   # SPOC aperture = 3 rows x cols 237,238 (= cutout cols 10, 11)
cc = np.corrcoef(dev[gs], pred[gs])[0, 1]
coef = np.polyfit(pred[gs], dev[gs], 1)
corr = sap - pred
mm_sap = measure(ts, np.where(sp["q"] == 0, sap, np.nan), TC, DUR); mm_corr = measure(ts, np.where(sp["q"] == 0, corr, np.nan), TC, DUR)
res["spoc_sap_vs_column_offset"] = dict(pearson_r=round(float(cc), 3), slope=round(float(coef[0]), 3), intercept=round(float(coef[1]), 1),
    sap_depth_ppt=round(mm_sap["depth"]*1e3, 2), sap_sig=round(mm_sap["sig_adopt"]*1e3, 2),
    sap_minus_column_offset_depth_ppt=round(mm_corr["depth"]*1e3, 2), sig=round(mm_corr["sig_adopt"]*1e3, 2))
# dips in SPOC SAP below -1% after anomaly, and their col-10 offsets
w = gs & (dev / base < -0.01)
res["spoc_sap_cadences_below_-1pct_after_1424.5"] = int(w.sum())
res["those_with_col10_offset_below_-5"] = int((w & (o10 < -5)).sum())
# vet's other dips
for tt in [1414.94, 1417.44, 1428.31]:
    i = np.argmin(np.abs(t - tt)); j = np.abs(t - tt) < 0.07
    res[f"col10_offset_min_near_{tt}"] = round(float(np.nanmin(off[j, 10])), 1) if j.any() else None
json.dump(res, open("data/step2_column.json", "w"), indent=1)
print(json.dumps(res, indent=1))
# figure
fig, ax = plt.subplots(4, 1, figsize=(12, 12), sharex=True)
w = (t > 1424.4) & (t < 1428.5)
for c, col in [(8, "C2"), (9, "k"), (10, "C3"), (11, "C0"), (12, "C1")]:
    ax[0].plot(t[w], off[w, c] - (0 if c != 9 else np.nanmedian(off[w, 9])), ".-", ms=2, lw=.5, color=col, label=f"cutout col {c}" + (" (bad col, ~-1.08e5 e/s)" if c == 9 else " (target col)" if c == 10 else ""))
ax[0].set_ylabel("column offset [e-/s/px]\n(rows |dy|>3 from star)"); ax[0].legend(fontsize=7); ax[0].set_ylim(-60, 25)
ws = (ts > 1424.4) & (ts < 1428.5) & np.isfinite(sap)
ax[1].plot(ts[ws], dev[ws] / base * 1e3, "k.", ms=3, label="SPOC SAP")
ax[1].plot(ts[ws], pred[ws] / base * 1e3, "r-", lw=.8, label="3×(col10+col11 offset) / SAP")
ax[1].set_ylabel("ppt"); ax[1].legend(fontsize=7)
for k, name in enumerate(lcs):
    lc = lcs[name]; g = good & w
    ax[2 if "corrected" not in name else 3].plot(t[g], (lc[g] / np.nanmedian(lc[g]) - 1) * 1e3 - 15 * (k % 4), ".", ms=2,
        label=f"{name}: {res['own_phot'][name]['depth_ppt']} ± {res['own_phot'][name]['sig_adopt']} ppt")
ax[2].set_ylabel("own TESScut phot [ppt]"); ax[2].legend(fontsize=7); ax[3].legend(fontsize=7); ax[3].set_ylabel("column-corrected [ppt]")
for a in ax: a.axvline(TC, color="orange", alpha=.5)
ax[3].set_xlabel("BTJD"); fig.suptitle("S4: the dip is a column-wide offset in the column next to a bad column")
fig.tight_layout(); fig.savefig("figs/s4_column_artifact.png", dpi=110)
# image of the deficit
fig, ax = plt.subplots(1, 2, figsize=(10, 4.5))
im = ax[0].imshow(np.log10(np.clip(R, 10, None)), origin="lower"); ax[0].set_title("S4 median image (log), target at (10,10)")
im2 = ax[1].imshow(F[i0] - R, origin="lower", vmin=-35, vmax=35, cmap="RdBu_r"); ax[1].set_title("frame BTJD 1426.281 minus reference")
plt.colorbar(im2, ax=ax[1]); [a.plot(10, 10, "k+", ms=12) for a in ax]
fig.tight_layout(); fig.savefig("figs/s4_diff_frame.png", dpi=110)
