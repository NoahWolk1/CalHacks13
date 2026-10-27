// Staged vetting of one find (vetReport.ts runs it; /api/sky/vet streams it): the types, the tier
// rules and the plain-text report, shared by the server and the browser.
//
// Stages, cheapest and most decisive first:
//   0 host star sanity (catalogs; a hard gate: a fail stops the run unless forced)
//   1 signal integrity (individual transits, event consistency, model-shift uniqueness, SNR growth,
//     period, aliases, detrending, depth stability)
//   2 astrophysical false positives (odd/even, secondary, shape, duration, density, variability,
//     pulsation removal, archival radial velocities)
//   3 contamination and blends (difference images, centroids, apertures, Gaia neighbours and
//     unresolved companions, saturation, other pipelines, ZTF colours, a false-positive probability)
//   4 follow-up observations: recommended, never run here
//   5 triage: a tier and every check logged as pass / flag / fail / not run
import type { SkyObject } from "./types";

export type VetKind = "periodic" | "single" | "duo";
export type VetInput = {
  tic: string; ra: number; dec: number; kind: VetKind;
  /** Days; BTJD. Periodic signals only. */
  period?: number; t0?: number;
  /** Event times (BTJD) for single and duo dips. */
  times?: number[];
  duration: number; // days
  depth: number; // relative flux
  /** As found: SNR and number of transits, for the SNR-growth check. */
  snr?: number; transits?: number;
  /** The find's id and label in the run it came from. */
  id?: string; label?: string;
};

export type VetStatus = "pass" | "flag" | "fail" | "not-run" | "info";
export type VetStage = 0 | 1 | 2 | 3 | 4;
export type VetCheck = { id: string; stage: VetStage; name: string; status: VetStatus; value?: string; detail: string };

/** One individual transit (predicted or listed) with its measurement. */
export type VetEventRow = {
  n: number; t: number; sector: number; pipeline: string; camera?: number; ccd?: number;
  depth?: number; err?: number; snr?: number; coverage: number;
  /** Fitted mid-time minus the ephemeris (days) and its error, for transits that could be timed. */
  oc?: number; ocErr?: number;
  note?: string;
};

export type VetTier = "A" | "B" | "C" | "X" | "K";
export const TIER_LABEL: Record<VetTier, string> = {
  A: "A: passed every check run",
  B: "B: passed with open items",
  C: "C: ambiguous",
  X: "X: rejected",
  K: "K: already catalogued",
};

export type VetReport = {
  input: VetInput;
  star?: { teff?: number; radius?: number; mass?: number; logg?: number; rho?: number; tmag?: number; distance?: number; lumclass?: string };
  checks: VetCheck[];
  events: VetEventRow[];
  ephemeris?: { period: number; t0: number; errP?: number; errT0?: number; source: string };
  next?: { t: number; err?: number; utc: string }[];
  tier: VetTier; tierReason: string;
  /** Flags and checks that were not run (follow-up recommendations excluded). */
  open: string[];
  submit: string;
  sectors: number[]; lightCurves: number;
  gated: boolean;
  ms: number;
  /** The difference image of the sector where the source shows best (Stage 3). */
  pixels?: VetPixels;
  /** Statistical validation (Stage 3): scenario probabilities, approximate. */
  fpp?: { fpp: number; nfpp: number; scenarios: { id: string; label: string; prob: number }[]; notes: string[] };
};

export type VetPixels = {
  sector: number; detection: number;
  nx: number; ny: number; diff: number[]; oot: number[];
  target: { x: number; y: number }; source?: { x: number; y: number };
  stars: { x: number; y: number; label: string }[];
  verdict?: string;
};

export type VetStreamEvent =
  | { type: "progress"; text: string; ms: number }
  | { type: "check"; check: VetCheck; ms: number }
  | { type: "events"; events: VetEventRow[]; ms: number }
  | { type: "report"; report: VetReport; ms: number }
  | { type: "error"; message: string };

export const STAGE_LABEL: Record<VetStage, string> = {
  0: "Stage 0 · Host star sanity",
  1: "Stage 1 · Signal integrity",
  2: "Stage 2 · Astrophysical false positives",
  3: "Stage 3 · Contamination and blends",
  4: "Stage 4 · Follow-up observations",
};

/** What a find carries that vetting needs; null for finds that aren't transits (variables). */
export function vetInputFrom(o: SkyObject): VetInput | null {
  if (o.category !== "candidate") return null;
  const p = o.props, num = (k: string) => (p[k] === undefined || p[k] === "" ? undefined : Number(p[k]));
  const tic = String(p.TIC ?? "");
  const depth = (num("depth (ppt)") ?? NaN) / 1000, duration = (num("duration (hours)") ?? NaN) / 24;
  if (!/^\d+$/.test(tic) || !(depth > 0) || !(duration > 0)) return null;
  const base = { tic, ra: o.ra, dec: o.dec, duration, depth, snr: num("SNR"), id: o.id, label: o.type };
  const period = num("period (days)"), t0 = num("first transit (BTJD)");
  if (period && t0) return { ...base, kind: "periodic", period, t0, transits: num("transits observed") };
  if (p["times (BTJD)"] !== undefined) {
    const times = String(p["times (BTJD)"]).split(",").map(Number).filter(Number.isFinite);
    if (times.length >= 2) return { ...base, kind: "duo", times };
  }
  const t = num("time (BTJD)");
  return t ? { ...base, kind: "single", times: [t] } : null;
}

/** Stage 5: the tier from the logged checks and the number of transits measured.
 *  X: any fail. K: already catalogued (Stage 0). A: no flags, nothing open in Stages 0-3, ≥ 3 transits.
 *  B: no fails, ≤ 2 flags, ≥ 2 transits. C: the rest (≥ 3 flags, or a single transit: no period). */
export function tierOf(checks: VetCheck[], transits: number, known?: string): { tier: VetTier; reason: string; open: string[] } {
  const open = checks.filter((c) => c.stage < 4 && (c.status === "flag" || c.status === "not-run")).map((c) => `${c.name}: ${c.status === "flag" ? c.detail : `not run (${c.detail})`}`);
  if (known) return { tier: "K", reason: known, open };
  const fail = checks.find((c) => c.status === "fail");
  if (fail) return { tier: "X", reason: `${fail.name}: ${fail.detail}`, open };
  const flags = checks.filter((c) => c.stage < 4 && c.status === "flag");
  const notRun = checks.filter((c) => c.stage < 4 && c.status === "not-run");
  if (transits < 2) return { tier: "C", reason: "a single transit: the period is unknown, so nothing can be folded or predicted", open };
  if (flags.length >= 3) return { tier: "C", reason: `${flags.length} checks flagged: ${flags.map((f) => f.name.toLowerCase()).join(", ")}`, open };
  if (!flags.length && !notRun.length && transits >= 3) return { tier: "A", reason: "every check in Stages 0-3 ran and passed, on 3 or more transits", open };
  return {
    tier: "B",
    reason: [flags.length ? `${flags.length} flag${flags.length === 1 ? "" : "s"} (${flags.map((f) => f.name.toLowerCase()).join(", ")})` : "", notRun.length ? `${notRun.length} check${notRun.length === 1 ? "" : "s"} not run` : "", transits < 3 ? "only 2 transits" : ""].filter(Boolean).join("; "),
    open,
  };
}

const inRange = (v: unknown, lo: number, hi: number) => (typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi ? v : undefined);

/** Validates a vetting request body (the route's input). */
export function parseVetInput(b: unknown): VetInput | null {
  const o = b as Record<string, unknown> | null;
  if (!o || typeof o !== "object") return null;
  const tic = typeof o.tic === "string" && /^\d{1,12}$/.test(o.tic) ? o.tic : undefined;
  const ra = inRange(o.ra, 0, 360), dec = inRange(o.dec, -90, 90), duration = inRange(o.duration, 0.005, 2), depth = inRange(o.depth, 1e-6, 0.95);
  const kind = o.kind === "periodic" || o.kind === "single" || o.kind === "duo" ? o.kind : undefined;
  if (!tic || ra === undefined || dec === undefined || !duration || !depth || !kind) return null;
  const period = inRange(o.period, 0.1, 5000), t0 = inRange(o.t0, 0, 20_000);
  const times = Array.isArray(o.times) ? o.times.filter((t): t is number => inRange(t, 0, 20_000) !== undefined).slice(0, 4) : undefined;
  if (kind === "periodic" && (!period || t0 === undefined)) return null;
  if (kind === "single" && !times?.length) return null;
  if (kind === "duo" && (times?.length ?? 0) < 2) return null;
  const str = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : undefined);
  return {
    tic, ra, dec, kind, duration, depth,
    ...(kind === "periodic" ? { period, t0 } : { times }),
    ...(inRange(o.snr, 0, 1e5) !== undefined ? { snr: o.snr as number } : {}),
    ...(inRange(o.transits, 1, 1e5) !== undefined ? { transits: o.transits as number } : {}),
    ...(str(o.id, 12) ? { id: str(o.id, 12) } : {}), ...(str(o.label, 120) ? { label: str(o.label, 120) } : {}),
  };
}

const pct = (x: number) => (x < 0.001 ? `${(x * 100).toPrecision(1)}%` : `${(x * 100).toPrecision(2)}%`);
const ICON: Record<VetStatus, string> = { pass: "PASS", flag: "FLAG", fail: "FAIL", "not-run": "NOT RUN", info: "info" };

/** The report as plain text (for a CTOI note, a notebook or a chat), every check included. */
export function reportText(r: VetReport): string {
  const i = r.input, lines: string[] = [];
  lines.push(`Vetting report: TIC ${i.tic}${i.id ? ` (${i.id}${i.label ? `, ${i.label}` : ""})` : ""}`);
  lines.push(`Tier ${TIER_LABEL[r.tier]}. ${r.tierReason}`);
  if (r.ephemeris) lines.push(`Ephemeris (${r.ephemeris.source}): P = ${r.ephemeris.period.toFixed(6)}${r.ephemeris.errP ? ` ± ${r.ephemeris.errP.toFixed(6)}` : ""} d, T0 = BTJD ${r.ephemeris.t0.toFixed(4)}${r.ephemeris.errT0 ? ` ± ${r.ephemeris.errT0.toFixed(4)}` : ""}`);
  else if (i.times?.length) lines.push(`Events at BTJD ${i.times.map((t) => t.toFixed(3)).join(", ")}`);
  lines.push(`Depth ${(i.depth * 1000).toPrecision(3)} ppt, duration ${(i.duration * 24).toFixed(2)} h (as found). Data: ${r.lightCurves} light curves, sectors ${r.sectors.join(", ") || "none"}.`);
  for (const stage of [0, 1, 2, 3, 4] as VetStage[]) {
    const cs = r.checks.filter((c) => c.stage === stage);
    if (!cs.length) continue;
    lines.push("", STAGE_LABEL[stage]);
    for (const c of cs) lines.push(`  [${ICON[c.status]}] ${c.name}${c.value ? ` = ${c.value}` : ""}: ${c.detail}`);
  }
  if (r.events.length) {
    lines.push("", "Individual transits (BTJD, sector, depth ppt ± err, SNR, coverage, O-C min)");
    for (const e of r.events) lines.push(`  #${e.n} ${e.t.toFixed(3)} s${e.sector} ${e.pipeline}${e.camera ? ` cam${e.camera}/ccd${e.ccd}` : ""}  ${e.depth !== undefined ? `${(e.depth * 1000).toFixed(2)} ± ${((e.err ?? 0) * 1000).toFixed(2)}` : "n/a"}  ${e.snr !== undefined ? e.snr.toFixed(1) : "n/a"}  ${Math.round(e.coverage * 100)}%${e.oc !== undefined ? `  ${(e.oc * 1440).toFixed(1)} ± ${((e.ocErr ?? 0) * 1440).toFixed(1)}` : ""}${e.note ? `  (${e.note})` : ""}`);
  }
  if (r.next?.length) lines.push("", `Next transits: ${r.next.map((n) => `${n.utc}${n.err ? ` ± ${(n.err * 1440).toFixed(0)} min` : ""}`).join("; ")}`);
  if (r.fpp) lines.push("", `False-positive probability (approximate, TRICERATOPS-style): FPP ${pct(r.fpp.fpp)}, NFPP ${pct(r.fpp.nfpp)}; ${r.fpp.scenarios.slice(0, 5).map((x) => `${x.id} ${pct(x.prob)}`).join(", ")}`);
  if (r.open.length) lines.push("", "Open items:", ...r.open.map((o) => `  - ${o}`));
  if (r.ephemeris && (r.tier === "A" || r.tier === "B")) {
    const T14 = i.duration * 24;
    lines.push("", `CTOI fields: TIC ${i.tic} | period ${r.ephemeris.period.toFixed(6)} ± ${(r.ephemeris.errP ?? 0).toFixed(6)} d | epoch BJD ${(r.ephemeris.t0 + 2457000).toFixed(5)} ± ${(r.ephemeris.errT0 ?? 0).toFixed(5)} | depth ${Math.round(i.depth * 1e6)} ppm | duration ${T14.toFixed(2)} h | tier ${r.tier}`);
  }
  lines.push("", r.submit);
  return lines.join("\n");
}
