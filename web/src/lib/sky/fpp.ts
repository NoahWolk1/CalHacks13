// False-positive probability of a TESS transit candidate, an approximate re-implementation of
// TRICERATOPS (Giacalone & Dressing 2020; Giacalone et al. 2021). Every astrophysical way to make
// the dip — a planet on the target, an eclipsing binary, a bound or chance-aligned star hosting
// the eclipse, a resolved neighbour doing it — gets a prior (occurrence × multiplicity × geometry)
// and a marginal likelihood (Monte Carlo over its free parameters, χ² against the phase-folded
// light curve at the transit and at phase 0.5, plus the odd/even depth difference). The posterior
// share of the scenarios where a planet transits the target is 1 − FPP. Pure: no network.
import { massFromRadius } from "./transitFit";

const G = 6.674e-8, RSUN = 6.957e10, MSUN = 1.989e33, DAY = 86400;
const REARTH_SUN = 0.009168, MEARTH_SUN = 3.003e-6;

export type FppData = { dt: Float64Array; f: Float64Array; err: Float64Array };
export type FppInput = {
  P: number; T14: number; depth: number;
  primary: FppData;
  secondary?: FppData;
  oddEven?: { diff: number; err: number };
  star: { radius: number; mass: number; teff: number; tmag: number; distance?: number };
  kMaxKms?: number;
  /** radius/mass/teff (R☉, M☉, K) when known, e.g. from `starFromGaia`; else a Sun-like host. */
  neighbours: { id: string; label: string; sep: number; tmag: number; weight: number; radius?: number; mass?: number; teff?: number }[];
  background: { count: number; radiusArcsec: number; tmags: number[] };
  samples?: number; seed?: number;
};
export type FppScenario = { id: string; label: string; prob: number; lnZ: number };
export type FppResult = { fpp: number; nfpp: number; scenarios: FppScenario[]; best: string; notes: string[] };

// ── stars and eclipses ──────────────────────────────────────────────────────

/** Seeded uniform RNG (mulberry32), so a vetting report is reproducible. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };

const LD: [number, number, number][] = [[3500, 0.25, 0.35], [5000, 0.42, 0.2], [6000, 0.35, 0.23], [7500, 0.25, 0.28], [10000, 0.18, 0.3]];
/** Quadratic TESS-band limb darkening (u1, u2), linear in Teff between rough Claret (2017) anchors. */
export function limbDarkening(teff: number): [number, number] {
  const T = Number.isFinite(teff) ? teff : 5800;
  if (T <= LD[0][0]) return [LD[0][1], LD[0][2]];
  for (let i = 1; i < LD.length; i++) if (T <= LD[i][0]) {
    const [t0, a0, b0] = LD[i - 1], [t1, a1, b1] = LD[i], x = (T - t0) / (t1 - t0);
    return [a0 + x * (a1 - a0), b0 + x * (b1 - b0)];
  }
  return [LD[LD.length - 1][1], LD[LD.length - 1][2]];
}

/** Fraction of a limb-darkened disk's flux (radius 1) hidden by a dark disk of radius k whose centre
 *  is z away. Midpoint rule over 24 annuli spanning only the overlap [z−k, z+k]: annuli across the
 *  whole disk would miss an Earth-sized occulter that falls between two of them. */
export function occultedFlux(z: number, k: number, u1: number, u2: number, n = 24) {
  if (!(k > 0) || z >= 1 + k) return 0;
  const lo = Math.max(0, z - k), hi = Math.min(1, z + k), dr = (hi - lo) / n;
  let s = 0;
  for (let i = 0; i < n; i++) {
    const r = lo + (i + 0.5) * dr;
    let c: number;
    if (r <= k - z) c = 1;
    else if (r >= z + k || r <= z - k) c = 0;
    else c = Math.acos(Math.max(-1, Math.min(1, (r * r + z * z - k * k) / (2 * r * z)))) / Math.PI;
    if (!c) continue;
    const m = 1 - Math.sqrt(1 - r * r);
    s += (1 - u1 * m - u2 * m * m) * 2 * r * c;
  }
  return Math.min(1, (s * dr) / (1 - u1 / 3 - u2 / 6));
}

/** Main-sequence radius, Teff (and mass) from mass (solar units): crude power laws, enough to set a
 *  companion's size and how much light it adds. */
export function mainSequence(M: number) {
  const R = M <= 1 ? M ** 0.8 : M ** 0.57, L = M <= 2 ? M ** 4 : 1.4 * M ** 3.5;
  return { M, R, T: 5772 * (L / (R * R)) ** 0.25 };
}

/** TESS-band flux ∝ R²·B(T), Planck averaged over 600–1000 nm. */
export function bandFlux(R: number, T: number) {
  let s = 0;
  for (let i = 0; i < 5; i++) { const l = (600 + 100 * i) * 1e-9; s += 1 / (l ** 5 * Math.expm1(1.4388e-2 / (l * T))); }
  return (R * R * s) / 5 / 1e30;
}

// Dwarf BP−RP → Teff (Mamajek's main-sequence table, abridged).
const BPRP: [number, number][] = [[-0.1, 10000], [0, 9700], [0.2, 8100], [0.38, 7220], [0.59, 6510], [0.74, 5920], [0.84, 5660], [0.98, 5270], [1.43, 4440], [1.84, 3850], [2.23, 3550], [2.85, 3200], [3.3, 3000]];
/** Rough size of a Gaia source, so a neighbour hosting the eclipse has a duration it can actually
 *  make (an evolved neighbour is much bigger than the Sun). Teff from colour; R from the luminosity
 *  when the parallax is usable (BC_G ≈ 0, M_G☉ = 4.67), else the main-sequence radius at that Teff;
 *  mass from R on the main sequence. Undefined without a colour. */
export function starFromGaia(g: number, bpRp: number | undefined, parallaxMas: number | undefined): { radius: number; mass: number; teff: number } | undefined {
  if (bpRp === undefined || !Number.isFinite(bpRp)) return undefined;
  let teff = BPRP[BPRP.length - 1][1];
  if (bpRp <= BPRP[0][0]) teff = BPRP[0][1];
  else for (let i = 1; i < BPRP.length; i++) if (bpRp <= BPRP[i][0]) {
    const [c0, t0] = BPRP[i - 1], [c1, t1] = BPRP[i];
    teff = t0 + ((bpRp - c0) / (c1 - c0)) * (t1 - t0);
    break;
  }
  teff = Math.min(10000, Math.max(3000, teff));
  let R: number;
  if (parallaxMas !== undefined && parallaxMas > 0.2 && Number.isFinite(g)) {
    const absG = g - 5 * Math.log10(1000 / parallaxMas / 10), L = 10 ** (-0.4 * (absG - 4.67));
    R = Math.sqrt(L) / (teff / 5772) ** 2;
  } else {
    // Main-sequence mass with this Teff (Teff rises monotonically with M in `mainSequence`).
    let lo = 0.1, hi = 3;
    for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (mainSequence(m).T < teff) lo = m; else hi = m; }
    R = mainSequence((lo + hi) / 2).R;
  }
  const radius = Math.min(10, Math.max(0.1, R));
  return { radius, mass: Math.min(3, Math.max(0.1, radius ** 1.25)), teff };
}

/** Semi-major axis (cm) of a circular orbit, total mass in M☉, period in days. */
export const semiMajor = (Mtot: number, P: number) => Math.cbrt((G * Mtot * MSUN * (P * DAY) ** 2) / (4 * Math.PI * Math.PI));

/** One eclipsing configuration. Host radius 1; occulter radius k; impact b and a/R in host radii;
 *  wH, wO = host and occulter shares of the total light in the aperture (wO = 0 for a planet). */
export type Eclipse = { P: number; aR: number; b: number; k: number; uH: [number, number]; uO: [number, number]; wH: number; wO: number };

/** Flux lost at t days from conjunction: `p` the host eclipsed, `s` the occulter eclipsed half an
 *  orbit later (same geometry seen from the other side). Only the near conjunction counts. */
export function eclipseLoss(e: Eclipse, t: number): { p: number; s: number } {
  const ph = (2 * Math.PI * t) / e.P, c = Math.cos(ph);
  if (c <= 0) return { p: 0, s: 0 };
  const sn = Math.sin(ph), ci = e.b / e.aR, z = e.aR * Math.sqrt(sn * sn + ci * ci * c * c);
  if (z >= 1 + e.k) return { p: 0, s: 0 };
  return { p: e.wH * occultedFlux(z, e.k, e.uH[0], e.uH[1]), s: e.wO > 0 ? e.wO * occultedFlux(z / e.k, 1 / e.k, e.uO[0], e.uO[1]) : 0 };
}

// ── priors ──────────────────────────────────────────────────────────────────

/** Planets per star per unit ln P (Fressin et al. 2013-like: flat beyond 10 d, falling inside). */
const lnEta = (P: number) => Math.log(0.12 * Math.min(1, (P / 10) ** 1.5));
/** Binary fraction by primary mass (Raghavan et al. 2010; Duchêne & Kraus 2013). */
const fBin = (M: number) => (M < 0.6 ? 0.3 : M <= 1.3 ? 0.45 : 0.6);
/** Binary period density per ln P: log-normal in log10 P[d], μ 5.03, σ 2.28 (Raghavan et al. 2010). */
const lnPBin = (P: number) => { const x = (Math.log10(P) - 5.03) / 2.28; return -0.5 * x * x - Math.log(2.28 * Math.sqrt(2 * Math.PI) * Math.LN10); };
/** Standard normal CDF (Abramowitz & Stegun 7.1.26). */
function normCdf(x: number) {
  const t = 1 / (1 + (0.3275911 * Math.abs(x)) / Math.SQRT2);
  const e = 1 - t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429)))) * Math.exp(-(x * x) / 2);
  return x >= 0 ? (1 + e) / 2 : (1 - e) / 2;
}

/** Planet radius (R⊕) on [0.5, 25]: flat per ln R to 2.5 R⊕, ∝ (R/2.5)^−1.8 above. Inverse CDF:
 *  above 2.5 R⊕, x = (R/2.5)^−1.8 turns out uniform. */
const LN5 = Math.log(5), BIG = (1 - 10 ** -1.8) / 1.8;
function planetRadius(r: () => number) {
  const u = r() * (LN5 + BIG);
  if (u < LN5) return 0.5 * Math.exp(u);
  const x = 10 ** -1.8 + ((u - LN5) / BIG) * (1 - 10 ** -1.8);
  return 2.5 * Math.exp(-Math.log(x) / 1.8);
}

// ── the calculation ─────────────────────────────────────────────────────────

type Body = { M: number; R: number; T: number; u: [number, number]; F: number };
type Sample = { e: Eclipse; x2: boolean; lnW: number; Mh: number; Mo: number } | null;

/** Times to evaluate per bin: ×3 supersampling when bins are coarse against the transit. */
function prepare(d: FppData, T14: number) {
  const n = d.dt.length, gaps: number[] = [];
  for (let i = 1; i < n; i++) { const g = Math.abs(d.dt[i] - d.dt[i - 1]); if (g > 0) gaps.push(g); }
  gaps.sort((a, b) => a - b);
  const w = gaps.length ? gaps[gaps.length >> 1] : 0;
  const off = w > T14 / 15 ? [-w / 3, 0, w / 3] : [0];
  const idx: number[] = [];
  for (let i = 0; i < n; i++) if (Number.isFinite(d.f[i]) && d.err[i] > 0 && Number.isFinite(d.dt[i])) idx.push(i);
  const iv = Float64Array.from(idx, (i) => 1 / d.err[i] ** 2), y = Float64Array.from(idx, (i) => 1 - d.f[i]);
  const t = new Float64Array(idx.length * off.length);
  idx.forEach((i, j) => off.forEach((o, m) => (t[j * off.length + m] = d.dt[i] + o)));
  let flat = 0;
  for (let j = 0; j < y.length; j++) flat += iv[j] * y[j] * y[j];
  return { t, y, iv, ns: off.length, flat };
}

export function falsePositiveProbability(x: FppInput): FppResult {
  const N = Math.max(50, Math.round(x.samples ?? 2000)), seed = (x.seed ?? 1) >>> 0;
  const P = x.P, depth = Math.max(x.depth, 1e-7), st = x.star;
  const pos = (v: number | undefined, d: number) => (v !== undefined && Number.isFinite(v) && v > 0 ? v : d);
  const M1 = pos(st.mass, 1), R1 = pos(st.radius, 1), T1 = pos(st.teff, 5800), F1 = bandFlux(R1, T1);
  const target: Body = { M: M1, R: R1, T: T1, u: limbDarkening(T1), F: 1 };
  const GEN_F = bandFlux(1, 5800);
  const notes: string[] = [];
  const pri = prepare(x.primary, x.T14), sec = x.secondary ? prepare(x.secondary, x.T14) : null;
  const oe = x.oddEven && x.oddEven.err > 0 && Number.isFinite(x.oddEven.diff) ? x.oddEven : null;

  /** −½χ² of one configuration against everything measured. */
  const lnLike = (e: Eclipse, x2: boolean) => {
    let c2 = 0;
    const { t, y, iv, ns } = pri;
    for (let j = 0; j < y.length; j++) {
      let m = 0;
      for (let q = 0; q < ns; q++) { const l = eclipseLoss(e, t[j * ns + q]); m += x2 ? (l.p + l.s) / 2 : l.p; }
      c2 += iv[j] * (y[j] - m / ns) ** 2;
    }
    if (sec) {
      if (x2 || !(e.wO > 0)) c2 += sec.flat;
      else for (let j = 0; j < sec.y.length; j++) {
        let m = 0;
        for (let q = 0; q < sec.ns; q++) m += eclipseLoss(e, sec.t[j * sec.ns + q]).s;
        c2 += sec.iv[j] * (sec.y[j] - m / sec.ns) ** 2;
      }
    }
    if (oe) {
      // Which eclipse lands on the odd epochs is arbitrary, so compare magnitudes.
      const l0 = x2 ? eclipseLoss(e, 0) : null, md = l0 ? Math.abs(l0.p - l0.s) : 0;
      c2 += ((md - Math.abs(oe.diff)) / oe.err) ** 2;
    }
    return -0.5 * c2;
  };

  /** Host eclipsed by an occulter on a circular orbit; b uniform over [0, 1+k], weight (R_h+R_o)/a. */
  const orbit = (r: () => number, h: Body, oR: number, oM: number, oU: [number, number], oF: number, Ftot: number, Porb: number, x2 = false, lnExtra = 0): Sample => {
    const k = oR / h.R, aR = semiMajor(h.M + oM, Porb) / (h.R * RSUN), b = r() * (1 + k);
    if (!(aR > 1 + k) || b >= aR) return null;
    return { e: { P: Porb, aR, b, k, uH: h.u, uO: oU, wH: h.F / Ftot, wO: oF / Ftot }, x2, lnW: Math.log((1 + k) / aR) + lnExtra, Mh: h.M, Mo: oM };
  };
  const star = (M: number, rel: number): Body => { const s = mainSequence(M); return { ...s, u: limbDarkening(s.T), F: (bandFlux(s.R, s.T) / rel) }; };
  /** Companion uniform in mass ratio up to the primary (flux relative to the target's light). */
  const companion = (r: () => number, Mmax: number, rel = F1) => star(0.1 + r() * Math.max(0, Mmax - 0.1), rel);
  const planet = (r: () => number) => { const R = planetRadius(r); return { R: R * REARTH_SUN, M: massFromRadius(R) * MEARTH_SUN }; };
  const NO_U: [number, number] = [0, 0];

  // RV limit on the target's reflex motion for target-EB samples.
  let kTried = 0, kCut = 0;
  const rvOk = (s: Sample) => {
    if (!s || !(x.kMaxKms! > 0)) return !!s;
    const si = Math.sqrt(1 - (s.e.b / s.e.aR) ** 2);
    const K = (Math.cbrt((2 * Math.PI * G) / (s.e.P * DAY)) * s.Mo * MSUN * si) / ((s.Mh + s.Mo) * MSUN) ** (2 / 3) / 1e5;
    kTried++;
    if (K > x.kMaxKms!) { kCut++; return false; }
    return true;
  };

  const out: FppScenario[] = [];
  const run = (id: string, label: string, lnPrior: number, draw: (r: () => number) => Sample) => {
    if (!Number.isFinite(lnPrior)) return;
    const r = mulberry32(seed ^ hash(id));
    let mx = -Infinity, acc = 0;
    for (let i = 0; i < N; i++) {
      const s = draw(r);
      if (!s) continue;
      const v = lnLike(s.e, s.x2) + s.lnW;
      if (v > mx) { acc = acc * Math.exp(mx - v) + 1; mx = v; } else acc += Math.exp(v - mx);
    }
    if (mx === -Infinity) return;
    out.push({ id, label, prob: 0, lnZ: lnPrior + mx + Math.log(acc / N) });
  };

  // Unresolved bound companions: binaries closer than ~1″ at the star's distance.
  const d = st.distance !== undefined && st.distance > 0 ? st.distance : 0;
  const fUnres = d ? normCdf((Math.log10(Math.sqrt(d ** 3 / (M1 + (M1 + 0.1) / 2)) * 365.25) - 5.03) / 2.28) : 0.5;
  const lnBound = Math.log(fBin(M1) * fUnres);

  run("TP", "Planet transits the target", lnEta(P), (r) => { const p = planet(r); return orbit(r, target, p.R, p.M, NO_U, 0, 1, P); });
  run("EB", "Target is an eclipsing binary", Math.log(fBin(M1)) + lnPBin(P), (r) => {
    const c = companion(r, M1), s = orbit(r, target, c.R, c.M, c.u, c.F, 1 + c.F, P);
    return rvOk(s) ? s : null;
  });
  run("EBx2P", "Target is an eclipsing binary at twice the period", Math.log(fBin(M1)) + lnPBin(2 * P), (r) => {
    const c = companion(r, M1), s = orbit(r, target, c.R, c.M, c.u, c.F, 1 + c.F, 2 * P, true);
    return rvOk(s) ? s : null;
  });
  run("PTP", "Planet transits the target, diluted by an unresolved bound companion", lnEta(P) + lnBound, (r) => {
    const c = companion(r, M1), p = planet(r);
    return orbit(r, target, p.R, p.M, NO_U, 0, 1 + c.F, P);
  });
  run("STP", "Planet transits an unresolved bound companion", lnEta(P) + lnBound, (r) => {
    const c = companion(r, M1), p = planet(r);
    return orbit(r, c, p.R, p.M, NO_U, 0, 1 + c.F, P);
  });
  run("SEB", "Unresolved bound companion is an eclipsing binary", lnBound + lnPBin(P), (r) => {
    const c = companion(r, M1), t3 = star(c.M * (0.1 + 0.9 * r()), F1);
    return orbit(r, c, t3.R, t3.M, t3.u, t3.F, 1 + c.F + t3.F, P, false, Math.log(fBin(c.M)));
  });

  // Chance-aligned background stars inside ~1″ (unresolved), with magnitudes drawn from the field.
  const bg = x.background, frOf = (tm: number) => 10 ** (-0.4 * (tm - st.tmag));
  const canMake = (fr: number) => fr > 0 && (depth * (1 + fr)) / fr <= 1;
  const lam = bg.count > 0 && bg.radiusArcsec > 0 ? bg.count / bg.radiusArcsec ** 2 : 0;
  const bright = bg.tmags.filter((m) => Number.isFinite(m) && canMake(frOf(m)));
  if (lam > 0 && bg.tmags.length) {
    const lnBg = Math.log(lam * (bright.length / bg.tmags.length)), gen = (r: () => number): Body => ({ M: 1, R: 1, T: 5800, u: limbDarkening(5800), F: frOf(bright[Math.floor(r() * bright.length)]) });
    run("BTP", "Planet transits an unresolved background star", lnBg + lnEta(P), (r) => { const h = gen(r), p = planet(r); return orbit(r, h, p.R, p.M, NO_U, 0, 1 + h.F, P); });
    run("BEB", "Unresolved background star is an eclipsing binary", lnBg + Math.log(fBin(1)) + lnPBin(P), (r) => {
      const h = gen(r), c = companion(r, 1, GEN_F), cF = c.F * h.F;
      return orbit(r, h, c.R, c.M, c.u, cF, 1 + h.F + cF, P);
    });
    if (!bright.length) notes.push("No field star in the Gaia sample is bright enough to make this depth as an unresolved background eclipse.");
  } else notes.push("No Gaia field-star sample: chance-aligned background scenarios were not evaluated.");

  // Resolved neighbours: same per-star priors, scaled by how far pixels/centroids leave them in play.
  const ns = x.neighbours.map((n) => ({ ...n, fr: frOf(n.tmag) }));
  const excluded = ns.filter((n) => !(n.weight > 0)).length, faint = ns.filter((n) => n.weight > 0 && !canMake(n.fr)).length;
  const live = ns.filter((n) => n.weight > 0 && canMake(n.fr)).sort((a, b) => b.weight - a.weight || b.fr - a.fr);
  for (const n of live.slice(0, 12)) {
    const nR = pos(n.radius, 1), nM = pos(n.mass, n.radius ? Math.min(3, Math.max(0.1, nR ** 1.25)) : 1), nT = pos(n.teff, 5800), nF = bandFlux(nR, nT);
    const h: Body = { M: nM, R: nR, T: nT, u: limbDarkening(nT), F: n.fr }, lw = Math.log(Math.min(1, n.weight));
    run(`NTP:${n.id}`, `Planet transits neighbour ${n.label}`, lw + lnEta(P), (r) => { const p = planet(r); return orbit(r, h, p.R, p.M, NO_U, 0, 1 + h.F, P); });
    run(`NEB:${n.id}`, `Neighbour ${n.label} is an eclipsing binary`, lw + Math.log(fBin(1)) + lnPBin(P), (r) => {
      const c = companion(r, nM, nF), cF = c.F * h.F;
      return orbit(r, h, c.R, c.M, c.u, cF, 1 + h.F + cF, P);
    });
  }

  // Posterior shares.
  const mx = Math.max(...out.map((s) => s.lnZ));
  let tot = 0;
  for (const s of out) tot += (s.prob = Math.exp(s.lnZ - mx));
  for (const s of out) s.prob /= tot;
  out.sort((a, b) => b.prob - a.prob);
  const share = (f: (id: string) => boolean) => out.reduce((a, s) => a + (f(s.id) ? s.prob : 0), 0);
  const fpp = Math.min(1, Math.max(0, 1 - share((id) => id === "TP" || id === "PTP")));
  const nfpp = share((id) => id.startsWith("N"));

  notes.push("Approximate re-implementation of TRICERATOPS (circular orbits, main-sequence companions, Sun-like hosts for background stars and for neighbours without a Gaia size); run TRICERATOPS/VESPA before claiming validation.");
  notes.push(d
    ? `No high-resolution imaging: unresolved companions within ~1″ (${(fUnres * 100).toFixed(0)}% of binaries at ${d.toFixed(0)} pc) are allowed.`
    : "No high-resolution imaging and no distance: half of all binary companions are assumed unresolved.");
  notes.push(x.kMaxKms! > 0
    ? `Archival RVs (K < ${x.kMaxKms} km/s) exclude ${kTried ? ((kCut / kTried) * 100).toFixed(0) : 0}% of target eclipsing-binary configurations.`
    : "No archival RVs: the target's eclipsing-binary companions are not mass-limited.");
  if (!sec) notes.push("No phase-0.5 data: secondary eclipses are unconstrained.");
  if (!oe) notes.push("No odd/even depth measurement: twice-the-period binaries are only judged on shape.");
  if (excluded) notes.push(`${excluded} neighbour${excluded > 1 ? "s" : ""} excluded by pixel/centroid evidence.`);
  if (faint) notes.push(`${faint} neighbour${faint > 1 ? "s are" : " is"} too faint to make the depth even fully eclipsed.`);
  if (live.length > 12) notes.push(`Only the 12 most plausible of ${live.length} viable neighbours were modelled.`);
  notes.push("Target scenarios assume the light curve is already corrected for neighbours' contaminating flux; eclipsing companions at other periods (x2P for bound/background stars) are not modelled.");
  return { fpp, nfpp, scenarios: out, best: out[0]?.id ?? "TP", notes };
}
