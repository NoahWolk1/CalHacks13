"""All MAST SPOC+QLP sectors: box scan for any other ~3 h dip (repeat/secondary), and period coverage."""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, json
from scipy.ndimage import median_filter
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
from lcio import load_all
TC, DUR, DEP = 1426.302, 0.125, 0.0141
L = load_all()
pref = {}
for r in L:
    col = next((c for c in ["PDCSAP_FLUX","KSPSAP_FLUX","DET_FLUX","SAP_FLUX"] if c in r), None)
    t, y, q = r["t"], r[col], r["q"]
    g = np.isfinite(t) & np.isfinite(y) & (q == 0)
    if g.sum() < 50: continue
    t, y = t[g], y[g] / np.nanmedian(y[g])
    dt = np.median(np.diff(t)); k = max(int(round(1.0 / dt)) | 1, 5)
    y = y / median_filter(y, size=k, mode="nearest")
    pref.setdefault(r["sector"], []).append((r["author"], t, y, dt))
events = []; cov_t = []; summary = []
for s in sorted(pref):
    for author, t, y, dt in pref[s]:
        cov_t.append(t)
        n = max(int(round(DUR / dt)), 1)
        c = np.full(len(y), np.nan)
        cv = np.convolve(y, np.ones(n) / n, mode="valid"); h0 = (n - 1) // 2
        c[h0:h0 + len(cv)] = cv
        # also drop windows that straddle gaps > 0.1 d
        tw = np.full(len(y), np.nan); tw[h0:h0 + len(cv)] = t[n - 1:] - t[:len(cv)]
        c[~(tw < DUR * 1.5)] = np.nan
        sig = 1.4826 * np.nanmedian(np.abs(c - np.nanmedian(c)))
        d = 1 - c
        # local maxima above 5 sigma and 3 ppt
        idx = np.where(np.nan_to_num(d) > max(5 * sig, 0.003))[0]
        picked = []
        for i in idx[np.argsort(-d[idx])]:
            if all(abs(t[i] - t[j]) > 0.3 for j in picked): picked.append(i)
        summary.append(dict(sector=int(s), author=author, n=len(t), sigma_3h_ppt=round(sig * 1e3, 3), maxdip_ppt=round(float(np.nanmax(d)) * 1e3, 2),
                            limit_3sig_ppt=round(3 * sig * 1e3, 2), n_events_gt5sig=len(picked)))
        for i in picked[:5]:
            events.append(dict(sector=int(s), author=author, t=round(float(t[i]), 3), depth_ppt=round(float(d[i]) * 1e3, 2), snr=round(float(d[i] / sig), 1)))
for x in summary: print(x)
print("events >5 sigma & >3 ppt:"); [print(e) for e in sorted(events, key=lambda e: -e["depth_ppt"])]
# period coverage: P allowed if no other epoch TC + kP (k != 0) lands on >=50% covered data
T = np.sort(np.concatenate(cov_t))
def covered(tc):
    j = np.searchsorted(T, [tc - DUR / 2, tc + DUR / 2]); return (j[1] - j[0]) >= 3
Ps = np.exp(np.linspace(np.log(1.0), np.log(3000), 60000))
allowed = []
for P in Ps:
    ks = np.arange(np.ceil((T[0] - TC) / P), np.floor((T[-1] - TC) / P) + 1)
    ks = ks[ks != 0]
    allowed.append(not any(covered(TC + k * P) for k in ks))
allowed = np.array(allowed)
# contiguous allowed ranges
rng = []; i = 0
while i < len(Ps):
    if allowed[i]:
        j = i
        while j + 1 < len(Ps) and allowed[j + 1]: j += 1
        rng.append((round(Ps[i], 2), round(Ps[j], 2))); i = j + 1
    else: i += 1
print("data span", T[0], T[-1], "N sectors", len(pref))
print("min allowed P", rng[0] if rng else None, "N allowed ranges", len(rng))
print("allowed ranges with P<400 d:", [r for r in rng if r[0] < 400][:60])
frac = lambda a, b: allowed[(Ps >= a) & (Ps < b)].mean()
print("allowed fraction 10-100 d %.3f, 100-1000 d %.3f, 1000-3000 d %.3f" % (frac(10, 100), frac(100, 1000), frac(1000, 3000)))
json.dump(dict(summary=summary, events=events, allowed_ranges=rng, sectors=sorted(int(s) for s in pref)), open("data/step5_allsectors.json", "w"), indent=1)
fig, ax = plt.subplots(figsize=(12, 4))
for s in sorted(pref):
    for author, t, y, dt in pref[s]:
        ax.plot(t, (y - 1) * 1e3 - (0 if author == "QLP" else 30), ",", color="C0" if author == "QLP" else "C1")
ax.axvline(TC, color="r", alpha=.4); ax.set_ylim(-80, 20); ax.set_xlabel("BTJD"); ax.set_ylabel("ppt (QLP top, SPOC −30)")
ax.set_title("TIC 299940140: all SPOC/QLP sectors on MAST, 1-d median-detrended, q=0")
fig.tight_layout(); fig.savefig("figs/all_sectors.png", dpi=110)
