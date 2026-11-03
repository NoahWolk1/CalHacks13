// Checks from the follow-ups of the first sweep's 20 tier-C finds (candidates-2026-11/*/REPORT.md),
// none of which was a planet. What a person did by hand to reject each one:
// - count dips and brightenings of the event's size in the star's raw flux (equal rates mean noise);
// - look at the star's own variability around the dip (a dip at the bottom of a rotation trough, or
//   just after a flare or a brightening, is what detrending leaves there);
// - check SPOC's scattered-light flag and the background's slope at the dip;
// - check whether other stars in the same pixels dip at the same time (a background error);
// - place the host in the Magellanic Clouds when its parallax says it's there (the TIC then has
//   the distance, and so the radius, wrong).
import { median } from "./timeseries";
import { combineDepths, localDepth, pixelPhotometry, type Depth } from "./artifacts";
import { skyToPix, type Cutout, type PixStar } from "./pixels";
import { radiusFromLuminosity } from "./hostStar";
import { tmagFromGaia } from "./archives";

type Pts = { t: Float64Array; f: Float64Array; b?: Float64Array };

/** Mean flux in bins of `w` days (bins with fewer than 2 points dropped). */
export function binPoints(s: Pts, w: number): Pts {
  const t: number[] = [], f: number[] = [];
  let i = 0;
  while (i < s.t.length) {
    const start = s.t[i];
    let k = 0, st = 0, sf = 0;
    while (i < s.t.length && s.t[i] < start + w) { st += s.t[i]; sf += s.f[i]; k++; i++; }
    if (k >= 2) { t.push(st / k); f.push(sf / k); }
  }
  return { t: Float64Array.from(t), f: Float64Array.from(f) };
}

/** How far (days) `t` is from the nearest edge of the data: a gap of more than `gap` days, or the series' ends. */
export function edgeDistance(t: ArrayLike<number>, x: number, gap = 0.3) {
  if (!t.length) return Infinity;
  let d = Math.min(Math.abs(x - t[0]), Math.abs(t[t.length - 1] - x));
  for (let i = 1; i < t.length; i++) if (t[i] - t[i - 1] > gap) d = Math.min(d, Math.abs(x - t[i - 1]), Math.abs(t[i] - x));
  return d;
}

/** The event's significance in the raw flux against every other moment of it: a box of `duration`
 *  slid in steps of duration/2 (each against its own local quadratic baseline, red noise in the
 *  error), counting separate dips and separate brightenings at least as significant as the event.
 *  Noise and systematics make both signs; a transit makes only dips. */
export function dipCensus(sets: Pts[], events: number[], duration: number) {
  const reach = Math.max(1, 2.5 * duration), w = Math.min(duration / 6, 1 / 48);
  const bins = sets.map((s) => binPoints(s, w)).filter((s) => s.t.length >= 30);
  const ev = combineDepths(events.flatMap((t) => { const s = bins.find((b) => t > b.t[0] && t < b.t[b.t.length - 1]); const d = s && localDepth(s, t, duration, reach); return d ? [d.plain] : []; }));
  if (!ev || !(ev.err > 0)) return null;
  const sig = ev.depth / ev.err;
  let dips = 0, ups = 0, trials = 0;
  for (const s of bins) {
    let run = 0; // +1 inside a run of dips, -1 inside a run of brightenings
    for (let x = s.t[0] + duration; x < s.t[s.t.length - 1] - duration; x += duration / 2) {
      if (events.some((e) => Math.abs(x - e) < 1.5 * duration) || edgeDistance(s.t, x) < duration / 2) { run = 0; continue; }
      const d = localDepth(s, x, duration, reach);
      if (!d || !(d.plain.err > 0)) { run = 0; continue; }
      trials++;
      const z = d.plain.depth / d.plain.err;
      if (z >= sig) { if (run !== 1) dips++; run = 1; }
      else if (-z >= sig) { if (run !== -1) ups++; run = -1; }
      else run = 0;
    }
  }
  return { event: ev, sig, dips, ups, trials, days: (trials * duration) / 2 };
}

/** The star's own light around a dip: the range of its 12-hour running median within ±1 day (does the
 *  dip sit at the bottom of a trough of variability much deeper than itself?), and the tallest
 *  hour-long brightening within 0.7 days (a flare, or the peak of the star's own variability:
 *  detrending around one leaves a dip on its flanks). */
export function variabilityAt(s: Pts, tc: number, duration: number, depth: number) {
  const h = binPoints({ t: s.t, f: s.f }, 1 / 24);
  const idx: number[] = [];
  for (let i = 0; i < h.t.length; i++) if (Math.abs(h.t[i] - tc) <= 2) idx.push(i);
  if (idx.length < 24) return null;
  const smooth = idx.map((i) => median(idx.filter((j) => Math.abs(h.t[j] - h.t[i]) <= 0.25).map((j) => h.f[j])));
  const near = idx.map((i, k) => ({ t: h.t[i], f: h.f[i], s: smooth[k] }));
  const day = near.filter((p) => Math.abs(p.t - tc) <= 1);
  if (day.length < 12) return null;
  const lo = day.reduce((a, b) => (b.s < a.s ? b : a)), hi = day.reduce((a, b) => (b.s > a.s ? b : a));
  const amp = hi.s - lo.s;
  const atMinimum = amp >= 5 * depth && Math.abs(lo.t - tc) <= Math.max(0.2, duration);
  const resid = near.map((p) => p.f - p.s);
  const noise = 1.4826 * median(resid.map((r) => Math.abs(r - median(resid))));
  const base = median(near.map((p) => p.f));
  const cand = near.filter((p) => Math.abs(p.t - tc) <= 0.7 && Math.abs(p.t - tc) > duration / 2);
  const top = cand.length ? cand.reduce((a, b) => (b.f > a.f ? b : a)) : undefined;
  const brightening = top && top.f - base >= 4 * depth && top.f - base >= 6 * noise ? { t: top.t, excess: top.f - base } : undefined;
  return { amp, minAt: lo.t, atMinimum, brightening };
}

/** SPOC's stray-light flag (quality bit 4096) on the cadences within a duration of `tc`, and how
 *  steep the pipeline's background is there against the rest of the light curve (percentile of
 *  |slope| over boxes of the same length). */
export function scatteredLightAt(lc: { time: ArrayLike<number>; quality: ArrayLike<number>; bkg?: ArrayLike<number> }, tc: number, duration: number) {
  let n = 0, flagged = 0;
  for (let i = 0; i < lc.time.length; i++) if (Math.abs(lc.time[i] - tc) < duration) { n++; if (((lc.quality[i] / 4096) | 0) % 2 === 1) flagged++; }
  let rampPct: number | undefined, level: number | undefined;
  if (lc.bkg) {
    const t: number[] = [], b: number[] = [];
    for (let i = 0; i < lc.time.length; i++) if (lc.quality[i] === 0 && Number.isFinite(lc.time[i]) && Number.isFinite(lc.bkg[i])) { t.push(lc.time[i]); b.push(lc.bkg[i]); }
    const slope = (x: number) => {
      let k = 0, st = 0, sb = 0, stt = 0, stb = 0;
      for (let i = 0; i < t.length; i++) if (Math.abs(t[i] - x) < duration) { const dt = t[i] - x; k++; st += dt; sb += b[i]; stt += dt * dt; stb += dt * b[i]; }
      if (k < 8) return undefined;
      const den = k * stt - st * st;
      return den > 0 ? { s: Math.abs((k * stb - st * sb) / den), m: sb / k } : undefined;
    };
    const here = slope(tc);
    if (here && t.length > 100) {
      const all: number[] = [], lv: number[] = [];
      for (let x = t[0] + duration; x < t[t.length - 1] - duration; x += duration) { const s = slope(x); if (s) { all.push(s.s); lv.push(s.m); } }
      if (all.length >= 20) {
        rampPct = all.filter((v) => v < here.s).length / all.length;
        const med = median(lv), mad = 1.4826 * median(lv.map((v) => Math.abs(v - med)));
        level = mad > 0 ? (here.m - med) / mad : 0;
      }
    }
  }
  return { cadences: n, flagged: n ? flagged / n : 0, rampPct, level };
}

/** A momentum dump (quality bit 32) within the dip or 0.1 day either side of it. */
export function dumpNear(lc: { time: ArrayLike<number>; quality: ArrayLike<number> }, tc: number, duration: number) {
  for (let i = 0; i < lc.time.length; i++) if (Math.abs(lc.time[i] - tc) <= duration / 2 + 0.1 && ((lc.quality[i] / 32) | 0) % 2 === 1) return lc.time[i];
  return undefined;
}

/** The same dip in other stars' light: our own 1-px-radius photometry of up to 10 other stars in the
 *  cutout (at least 2.5 px from the target, no more than 2 mag fainter), with each star's flux deficit
 *  at the dip times converted to a depth on the target's aperture. A background or scattered-light
 *  error takes about the same flux from every aperture of the same size, whatever star is in it. */
export function commonMode(c: Cutout, target: { ra: number; dec: number; tmag: number }, stars: PixStar[], times: number[], duration: number) {
  const T = pixelPhotometry(c, target.ra, target.dec, { radius: 1 });
  if (!T) return null;
  const tp = skyToPix(c.wcs, target.ra, target.dec);
  const dep = (ph: NonNullable<typeof T>) => combineDepths(times.flatMap((t) => { const d = localDepth(ph, t, duration); return d ? [d.plain] : []; }));
  const own = dep(T);
  if (!own) return null;
  const per: { label: string; eq: Depth; z: number }[] = [];
  for (const s of stars.filter((x) => x.id !== "target" && x.tmag < target.tmag + 2).sort((a, b) => a.tmag - b.tmag)) {
    if (per.length >= 10) break;
    const p = skyToPix(c.wcs, s.ra, s.dec);
    if (Math.hypot(p.x - tp.x, p.y - tp.y) < 2.5 || p.x < 1 || p.y < 1 || p.x > c.nx - 2 || p.y > c.ny - 2) continue;
    const ph = pixelPhotometry(c, s.ra, s.dec, { radius: 1 });
    const d = ph && dep(ph);
    if (!ph || !d) continue;
    // Flux deficit per aperture pixel, as a depth of the target's aperture.
    const k = (ph.base / ph.pixels) * (T.pixels / T.base);
    per.push({ label: s.label, eq: { depth: d.depth * k, err: d.err * k, points: d.points }, z: d.depth / d.err });
  }
  if (per.length < 3) return { own, per, mean: null };
  return { own, per, mean: combineDepths(per.map((x) => x.eq)) };
}

/** Is the host in the Large or Small Magellanic Cloud? Inside the Cloud's box on the sky, a parallax
 *  consistent with zero and the Cloud's proper motion. The TIC then puts it at a few kpc (from a
 *  negative DR2 parallax) and can call a supergiant a dwarf; at the Cloud's distance the radius
 *  comes from the luminosity. */
export function magellanicHost(ra: number, dec: number, g: { g?: number; bpRp?: number; parallax?: number; parallaxErr?: number; pmra?: number; pmdec?: number; teff?: number } | undefined, teff?: number) {
  if (!g || g.parallax === undefined || g.pmra === undefined || g.pmdec === undefined || g.g === undefined) return null;
  const clouds = [
    { name: "Large Magellanic Cloud", box: (a: number, d: number) => a > 60 && a < 100 && d > -76 && d < -60, pm: [1.85, 0.3], dist: 49_600 },
    { name: "Small Magellanic Cloud", box: (a: number, d: number) => (a > 350 || a < 35) && d > -77 && d < -68, pm: [0.75, -1.25], dist: 62_000 },
  ];
  const c = clouds.find((x) => x.box(ra, dec));
  if (!c) return null;
  const plxOk = g.parallax < 3 * (g.parallaxErr ?? 0.03) + 0.05;
  if (!plxOk || Math.hypot(g.pmra - c.pm[0], g.pmdec - c.pm[1]) > 1) return null;
  const tmag = tmagFromGaia(g.g, g.bpRp);
  const absG = g.g - 5 * Math.log10(c.dist / 10);
  const T = teff ?? g.teff;
  const radius = T ? radiusFromLuminosity(tmag, c.dist, T) : undefined;
  return { cloud: c.name, distance: c.dist, absG, radius, teff: T };
}
