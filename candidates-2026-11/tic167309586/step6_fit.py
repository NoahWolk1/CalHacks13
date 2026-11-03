"""Joint batman fit of the pipeline-detrended dips (the only products where they appear), free b and stellar density.
Case A: duo S4 SPOC PDCSAP (1416.784) + S37 TESS-SPOC PDCSAP (2325.862), P = 909.08/n.
Case B: the vet's P~106.87 d: S4 SPOC PDCSAP + S90 SPOC PDCSAP (3767.99), 22 cycles apart.
This characterises the reported signal, NOT a validated transit (steps 2-3 show it is absent in SAP/pixels)."""
import warnings; warnings.filterwarnings("ignore")
import json, sys, numpy as np, batman, emcee
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
from lcio import load_all
from measure import segments
G = 6.674e-8; RHO_SUN = 1.408
RHO_CAT, RHO_CAT_E = 1.927, 0.392
L = load_all()
def get(s, author, col, tc):
    r = [r for r in L if r["sector"] == s and r["author"] == author][0]
    t, y = r["t"], r[col].copy(); y[r["q"] != 0] = np.nan
    w = np.isfinite(y) & (np.abs(t - tc) < 1.0); t, y = t[w], y[w] / np.nanmedian(y[w])
    if author == "SPOC":  # bin 2-min to 10-min for speed
        k = np.floor((t - t[0]) / (10/1440)).astype(int); u, inv, c = np.unique(k, return_inverse=True, return_counts=True)
        t = np.bincount(inv, t) / c; y = np.bincount(inv, y) / c
    B = []
    for idx in segments(t):
        for kk in range(3):
            c_ = np.zeros_like(t); c_[idx] = (t[idx] - tc) ** kk; B.append(c_)
    return dict(t=t, y=y, B=np.vstack(B).T, exp=600, lab=f"S{s} {author} {col}", tc0=tc)
def aRs(rho, P): return (G * rho * RHO_SUN * (P * 86400) ** 2 / (3 * np.pi)) ** (1 / 3)
def make(D, P):
    for d in D:
        p = batman.TransitParams(); p.t0 = 0; p.per = P; p.rp = .03; p.a = 100; p.inc = 89.9; p.ecc = 0; p.w = 90
        p.u = [0.45, 0.20]; p.limb_dark = "quadratic"; d["params"] = p
        d["m"] = batman.TransitModel(p, d["t"] - d["t"].mean(), supersample_factor=5, exp_time=d["exp"] / 86400.)
def lnlike(th, D, n, ret=False):
    tc1, tc2, k, b, lrho, lj1, lj2 = th
    P = (tc2 - tc1) / n; a = aRs(10 ** lrho, P)
    if not (0.005 < k < 0.3 and 0 <= b < 1 + k and -2 < lrho < 3 and a > 1 + k and abs(tc1 - D[0]["tc0"]) < .25 and abs(tc2 - D[1]["tc0"]) < .25 and -12 < lj1 < -4 and -12 < lj2 < -4):
        return -np.inf
    inc = np.degrees(np.arccos(b / a)); ll = 0; mods = []
    for d, tc, lj in [(D[0], tc1, lj1), (D[1], tc2, lj2)]:
        p = d["params"]; p.t0 = tc - d["t"].mean(); p.per = P; p.rp = k; p.a = a; p.inc = inc
        tr = d["m"].light_curve(p)
        coef, *_ = np.linalg.lstsq(d["B"] * tr[:, None], d["y"], rcond=None)
        mod = tr * (d["B"] @ coef); var = np.exp(2 * lj)
        ll += -0.5 * np.sum((d["y"] - mod) ** 2 / var + np.log(2 * np.pi * var)); mods.append((tr, d["B"] @ coef))
    return (ll, mods) if ret else ll
def run(name, D, n, nsteps=5000):
    P0 = (D[1]["tc0"] - D[0]["tc0"]) / n; make(D, P0); rng = np.random.default_rng(n)
    p0 = []
    while len(p0) < 40:
        th = [D[0]["tc0"] + rng.normal(0, .02), D[1]["tc0"] + rng.normal(0, .02), rng.uniform(.02, .05), rng.uniform(0, .95), rng.uniform(-1, 2), np.log(5e-4) + rng.normal(0, .1), np.log(5e-4) + rng.normal(0, .1)]
        if np.isfinite(lnlike(th, D, n)): p0.append(th)
    S = emcee.EnsembleSampler(40, 7, lnlike, args=(D, n)); S.run_mcmc(np.array(p0), nsteps, progress=False)
    full = S.get_chain(discard=nsteps // 2, thin=10); lpf = S.get_log_prob(discard=nsteps // 2, thin=10)
    wmed = np.median(lpf, axis=0); keep = wmed > wmed.max() - 15
    ch = full[:, keep].reshape(-1, 7); lp = lpf[:, keep].ravel()
    P = (ch[:, 1] - ch[:, 0]) / n; rho = 10 ** ch[:, 4]; a = aRs(rho, P); k, b = ch[:, 2], ch[:, 3]
    T14 = P / np.pi * np.arcsin(np.sqrt(np.clip((1 + k) ** 2 - b ** 2, 0, None)) / a / np.sin(np.arccos(b / a))) * 24
    q = lambda x: [round(float(np.percentile(x, 50)), 4), round(float(np.percentile(x, 50) - np.percentile(x, 16)), 4), round(float(np.percentile(x, 84) - np.percentile(x, 50)), 4)]
    out = dict(case=name, n=n, P=q(P), Tc1=q(ch[:, 0]), Tc2=q(ch[:, 1]), depth_ppt=q(k ** 2 * 1e3), Rp_earth=q(k * 0.7759 * 109.1), b=q(b), T14_h=q(T14),
               rho_star=q(rho), rho_over_catalog=q(rho / RHO_CAT), rho_95=[round(float(np.percentile(rho, 2.5)), 3), round(float(np.percentile(rho, 97.5)), 3)],
               frac_rho_within_2sig_catalog=round(float(np.mean(np.abs(rho - RHO_CAT) < 2 * RHO_CAT_E)), 4), walkers_dropped=int((~keep).sum()))
    best = ch[np.argmax(lp)]; ll, mods = lnlike(best, D, n, ret=True)
    fig, ax = plt.subplots(1, 3, figsize=(15, 4))
    for i, (d, (tr, base)) in enumerate(zip(D, mods)):
        ax[i].plot(d["t"], (d["y"] / base - 1) * 1e3, ".", ms=2, color="k"); ax[i].plot(d["t"], (tr - 1) * 1e3, "r-"); ax[i].set_title(d["lab"], fontsize=9); ax[i].set_ylabel("ppt")
    ax[2].hist(np.log10(rho / RHO_CAT), 60); ax[2].axvline(0, color="r"); ax[2].set_xlabel("log10(rho_fit / rho_catalog)")
    fig.suptitle(f"{name}: joint fit to pipeline-detrended dips, P={np.median(P):.3f} d (NOT a validated transit)", fontsize=10)
    fig.tight_layout(); fig.savefig(f"figs/jointfit_{name}.png", dpi=100); plt.close(fig)
    print(json.dumps(out), flush=True); return out
if __name__ == "__main__":
    A = [get(4, "SPOC", "PDCSAP_FLUX", 1416.784), get(37, "TESS-SPOC", "PDCSAP_FLUX", 2325.862)]
    Bc = [get(4, "SPOC", "PDCSAP_FLUX", 1416.784), get(90, "SPOC", "PDCSAP_FLUX", 3767.99)]
    res = [run("duo_n1", A, 1), run("duo_n4", A, 4), run("P106_vet", Bc, 22)]
    json.dump(res, open("data/step6_fit.json", "w"), indent=1)
