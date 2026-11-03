"""Tall S4 cutout (151 rows x 11 cols) along the target's CCD column: is the offset column-wide, and do other stars on it 'dip'?"""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, glob, json
from astropy.io import fits
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
from measure import measure
TC, DUR = 1426.302, 0.125
f = glob.glob("data/tesscut_tall/*.fits")[0]
h = fits.open(f); d = h[1].data; F = d["FLUX"].astype(float); t = d["TIME"].astype(float); q = d["QUALITY"]
good = (q == 0)
R = np.nanmedian(F[good], axis=0); ny, nx = R.shape
print("median row 75:", np.round(R[75], 0))
badc = int(np.argmin(R[75])); tc_ = badc + 1
print("bad column index", badc, "target column index", tc_)
i0 = np.argmin(np.abs(t - 1426.2812))
D = F[i0] - R
print("deficit col", tc_, "over all", ny, "rows: median %.1f, 5-95%% %.1f..%.1f" % (np.median(D[:, tc_]), *np.percentile(D[:, tc_], [5, 95])))
print("deficit col", tc_ + 1, "median %.1f; col %d median %.1f" % (np.median(D[:, tc_ + 1]), tc_ - 2, np.median(D[:, tc_ - 2])))
sky = np.nanpercentile(R[:, [0, 1, nx - 2, nx - 1]], 30)
# stars whose brightest pixel is in the target column or the column right of it
out = []
offrow = lambda r0: np.abs(np.arange(ny) - r0) > 4
for c in [tc_, tc_ + 1]:
    col = R[:, c] - np.median(R[:, c])
    for r0 in range(3, ny - 3):
        if col[r0] == col[r0 - 2:r0 + 3].max() and col[r0] > 150 and abs(r0 - 75) > 2:
            box = (slice(r0 - 1, r0 + 2), slice(max(c - 1, badc + 1), min(c + 2, nx)))
            lc = np.nansum(F[:, box[0], box[1]], axis=(1, 2))
            bk = np.nanmedian(F[:, :, [0, 1, nx - 2, nx - 1]].reshape(len(t), -1), axis=1) * F[0, box[0], box[1]].size
            # column-corrected: subtract each column's off-star offset
            offs = np.nanmedian((F - R)[:, offrow(r0), :], axis=1)
            lcc = np.nansum((F - offs[:, None, :])[:, box[0], box[1]], axis=(1, 2))
            y = np.where(good, lc - bk, np.nan); yc = np.where(good, lcc, np.nan)
            m = measure(t, y, TC, DUR); mc = measure(t, yc, TC, DUR)
            out.append(dict(row=r0, col=c, rows_from_target=r0 - 75, peak_e_s=float(R[r0, c]),
                            depth_raw_ppt=round(m["depth"] * 1e3, 1), sig_raw=round(m["sig_adopt"] * 1e3, 1),
                            depth_colcorr_ppt=round(mc["depth"] * 1e3, 2), sig_colcorr=round(mc["sig_adopt"] * 1e3, 2), lc=y))
for o in out: print({k: v for k, v in o.items() if k != "lc"})
json.dump([{k: v for k, v in o.items() if k != "lc"} for o in out], open("data/step3_column_stars.json", "w"), indent=1)
fig, ax = plt.subplots(1, 3, figsize=(13, 7), gridspec_kw=dict(width_ratios=[1, 1, 2.5]))
ax[0].imshow(np.log10(np.clip(R, 10, None)), origin="lower", aspect="auto"); ax[0].set_title("median (log)")
ax[1].imshow(D, origin="lower", aspect="auto", vmin=-35, vmax=35, cmap="RdBu_r"); ax[1].set_title("1426.281 − ref")
w = (t > 1424.5) & (t < 1428.5) & good
for k, o in enumerate(out[:8]):
    ax[2].plot(t[w], (o["lc"][w] / np.nanmedian(o["lc"][w]) - 1) * 1e3 - 40 * k, ".", ms=2, label=f"star row {o['row']} (Δ{o['rows_from_target']} px), col {o['col']}: raw {o['depth_raw_ppt']} ppt, col-corr {o['depth_colcorr_ppt']}±{o['sig_colcorr']}")
ax[2].axvline(TC, color="orange"); ax[2].legend(fontsize=6); ax[2].set_xlabel("BTJD"); ax[2].set_ylabel("ppt (offset)")
fig.tight_layout(); fig.savefig("figs/s4_column_stars.png", dpi=110)
