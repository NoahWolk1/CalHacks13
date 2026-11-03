"""Depth measurement with red-noise-aware errors.

Model: flux = baseline(t) - depth * trapezoid(t; tc, dur)
Baseline: independent polynomial per contiguous segment (segments split at gaps > GAP d),
so an orbit gap or downlink cannot be bridged by a single polynomial.

Errors:
  sig_white : formal LSQ error scaled by the RMS of residuals
  beta      : Pont et al. (2006) time-averaging factor at bin ~ dur/3..dur
  sig_emp   : robust (MAD) std of depths from the same fit slid across the rest of the
              sector at epochs with comparable coverage -> captures red noise + systematics.
  sig_adopt : max(sig_white*beta, sig_emp)
"""
import numpy as np

GAP = 0.1


def trapezoid(t, tc, dur, ingress_frac=0.08):
    x = np.abs(t - tc)
    half = dur / 2
    tau = ingress_frac * dur
    s = np.zeros_like(t)
    s[x <= half - tau] = 1.0
    m = (x > half - tau) & (x < half)
    s[m] = (half - x[m]) / tau
    return s


def segments(t):
    br = np.where(np.diff(t) > GAP)[0] + 1
    return np.split(np.arange(len(t)), br)


def fit_depth(t, f, tc, dur, win=1.0, order=2, min_cov=0.5):
    """t, f: arrays (f normalised ~1). Returns dict or None if coverage too low."""
    w = np.isfinite(f) & np.isfinite(t) & (np.abs(t - tc) < win)
    t, f = t[w], f[w]
    if len(t) < 10:
        return None
    s = trapezoid(t, tc, dur)
    # in-transit coverage relative to expected cadences
    dt = np.nanmedian(np.diff(t))
    n_exp = dur / dt
    cov = (s > 0.5).sum() / n_exp
    if cov < min_cov:
        return dict(cov=cov, depth=np.nan)
    cols = [-s]
    for idx in segments(t):
        ts = t[idx]
        span = ts.max() - ts.min()
        o = order if span > 0.8 else (1 if span > 0.3 else 0)
        # a segment that is (almost) entirely in transit cannot have a free baseline
        oot = (s[idx] < 0.01).sum()
        if oot < 5:
            o = -1
        for k in range(o + 1):
            c = np.zeros_like(t)
            c[idx] = ((ts - tc)) ** k
            cols.append(c)
    A = np.vstack(cols).T
    coef, *_ = np.linalg.lstsq(A, f, rcond=None)
    model = A @ coef
    r = f - model
    rms = np.std(r)
    cov_m = np.linalg.pinv(A.T @ A) * rms**2
    depth = coef[0]
    sig_white = np.sqrt(cov_m[0, 0])
    # Pont beta
    betas = []
    for nb_t in [dur / 3, dur / 2, dur]:
        n = max(int(round(nb_t / dt)), 2)
        nbin = len(r) // n
        if nbin < 4:
            continue
        rb = r[: nbin * n].reshape(nbin, n).mean(1)
        exp = rms / np.sqrt(n) * np.sqrt(nbin / (nbin - 1))
        betas.append(np.std(rb) / exp)
    beta = max(1.0, np.median(betas)) if betas else 1.0
    return dict(depth=depth, sig_white=sig_white, beta=beta, cov=cov, rms=rms,
                n=len(t), t=t, f=f, model=model, base=model + depth * s, s=s)


def empirical_sigma(t, f, tc_true, dur, win=1.0, order=2, step=0.1, exclude=0.6, min_cov=0.8):
    good = np.isfinite(f)
    t, f = t[good], f[good]
    grid = np.arange(t.min() + win * 0.5, t.max() - win * 0.5, step)
    d = []
    for tc in grid:
        if abs(tc - tc_true) < exclude:
            continue
        r = fit_depth(t, f, tc, dur, win, order, min_cov=min_cov)
        if r is None or not np.isfinite(r["depth"]):
            continue
        d.append(r["depth"])
    d = np.array(d)
    if len(d) < 10:
        return np.nan, d
    return 1.4826 * np.median(np.abs(d - np.median(d))), d


def measure(t, f, tc, dur, win=1.0, order=2, min_cov=0.5):
    f = f / np.nanmedian(f[np.abs(t - tc) < win])
    r = fit_depth(t, f, tc, dur, win, order, min_cov)
    if r is None or not np.isfinite(r.get("depth", np.nan)):
        return r
    se, dist = empirical_sigma(t, f, tc, dur, win, order)
    r["sig_emp"] = se
    r["emp_dist"] = dist
    r["sig_adopt"] = np.nanmax([r["sig_white"] * r["beta"], se])
    # false-alarm style: fraction of slid fits at least as deep
    r["frac_deeper"] = (dist >= r["depth"]).mean() if len(dist) else np.nan
    return r
