"""batman fit to the SPOC SAP 'event' (taken at face value), implied stellar density for several periods; compare with column-corrected data."""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, json, batman
from scipy.optimize import least_squares
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
from lcio import load_all
TC = 1426.302; RHO_CAT, E_RHO = 0.405, 0.089
sp = [r for r in load_all() if r["sector"] == 4 and r["author"] == "TESS-SPOC"][0]
t, y, q = sp["t"], sp["SAP_FLUX"], sp["q"]
w = (np.abs(t - TC) < 1.0) & (q == 0) & np.isfinite(y)
t, y = t[w], y[w] / np.nanmedian(y[w])
def model(p, P, tt):
    tc, k, b, lrho, c0, c1, c2 = p
    rho = 10**lrho * 1.408  # g/cc
    aR = ((6.674e-8 * rho * (P * 86400)**2) / (3 * np.pi))**(1 / 3)
    pr = batman.TransitParams(); pr.t0 = tc; pr.per = P; pr.rp = k; pr.a = aR
    pr.inc = np.degrees(np.arccos(min(b / aR, 1))); pr.ecc = 0; pr.w = 90; pr.u = [0.33, 0.26]; pr.limb_dark = "quadratic"
    m = batman.TransitModel(pr, tt, supersample_factor=7, exp_time=1800 / 86400).light_curve(pr)
    x = tt - TC
    return m * (c0 + c1 * x + c2 * x * x)
out = {}
for P in [30.0, 100.0, 262.5, 300.0, 1000.0]:
    best = None
    for b0 in [0.1, 0.5, 0.8, 0.95]:
        for lr in [-1, 0, 1]:
            f = lambda p: model(p, P, t) - y
            r = least_squares(f, [TC - 0.02, 0.12, b0, lr, 1, 0, 0], bounds=([TC - 0.15, 0.01, 0, -3, 0.9, -1, -1], [TC + 0.15, 0.6, 1.3, 3, 1.1, 1, 1]))
            if best is None or r.cost < best.cost: best = r
    p = best.x; res = y - model(p, P, t)
    out[P] = dict(tc=round(p[0], 4), k=round(p[1], 4), depth_ppt=round(p[1]**2 * 1e3, 1), b=round(p[2], 2), rho_fit_solar=round(10**p[3], 3),
                  rho_ratio_to_catalog=round(10**p[3] / RHO_CAT, 2), rms_ppt=round(np.std(res) * 1e3, 2), chi2_white=None)
    print(P, out[P])
# residual scatter vs out-of-event scatter
P = 300.0
f = lambda p: model(p, P, t) - y
json.dump({str(k): v for k, v in out.items()}, open("data/step6_fit.json", "w"), indent=1)
fig, ax = plt.subplots(figsize=(9, 5))
ax.plot(t, (y - 1) * 1e3, "k.", label="SPOC SAP, q=0")
tt = np.linspace(t.min(), t.max(), 2000); pp = [out[P][k] for k in ["tc", "k", "b"]]
best = least_squares(f, [out[P]["tc"], out[P]["k"], out[P]["b"], np.log10(out[P]["rho_fit_solar"]), 1, 0, 0]).x
ax.plot(tt, (model(best, P, tt) - 1) * 1e3, "r-", label=f"batman, P=300 d: depth {out[P]['depth_ppt']} ppt, b={out[P]['b']}, ρ={out[P]['rho_fit_solar']} ρ☉")
ax.axvline(TC, color="orange", alpha=.4); ax.legend(fontsize=8); ax.set_xlabel("BTJD"); ax.set_ylabel("ppt")
ax.set_title("Face-value transit fit to SPOC SAP (data are a column artifact, see s4_column_artifact.png)")
fig.tight_layout(); fig.savefig("figs/fit_spoc_sap.png", dpi=110)
