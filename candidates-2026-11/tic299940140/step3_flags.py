import warnings; warnings.filterwarnings("ignore")
import numpy as np
from lightkurve.utils import TessQualityFlags as F
from lcio import load_all
t0 = 1426.302
for r in [r for r in load_all() if r["sector"] == 4]:
    t, q = r["t"], r["q"]
    w = (t > t0 - 1.0) & (t < t0 + 1.0) & (q != 0)
    print(f"\nS4 {r['author']}: flagged cadences within 1 d: {w.sum()}")
    for v in np.unique(q[w]):
        tt = t[w & (q == v)]
        print(f"  q={v} {F.decode(int(v) & 0xFFFFFF) if v & 0xFFFFFF else ''}{' +bit30' if v & (1<<30) else ''}: n={len(tt)} t={tt.min():.3f}..{tt.max():.3f}")
    d = t[(q & 32) > 0]
    if len(d):
        g = np.split(d, np.where(np.diff(d) > 0.1)[0] + 1); print("  desat (bit 32):", [round(x.mean(), 3) for x in g])
    tf = t[np.isfinite(t)]; gi = np.where(np.diff(tf) > 0.1)[0]
    print("  gaps>0.1d:", [(round(tf[i], 3), round(tf[i+1], 3)) for i in gi]); print("  span", round(tf.min(), 3), round(tf.max(), 3))
    # first unflagged cadence after the long gap
    if "SAP_BKG" in r:
        b = r["SAP_BKG"]; ww = np.abs(t - t0) < 1
        print("  SAP_BKG in +/-1 d: median %.1f, at event %.1f" % (np.nanmedian(b[ww]), np.nanmedian(b[np.abs(t - t0) < 0.07])))
