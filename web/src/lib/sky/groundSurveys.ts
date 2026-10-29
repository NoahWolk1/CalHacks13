// Ground-survey photometry for the stars ZTF can't help with: ZTF stops at dec −30° and saturates
// brighter than G ≈ 12.5, while ASAS-SN (V/g, ~10-17 mag) and ATLAS (c/o, ~12-19 mag) cover the
// whole sky. Both come back as GroundPhot groups (one per survey, band and camera/unit, since each
// camera has its own zero point), times in BTJD, and `toZtfPoints` feeds them to the ZTF period
// search and scoring (ztfSeries normalises each group to its own median, as it does ZTF fields).
//  - ASAS-SN Sky Patrol v2 (Hart et al. 2023): the JSON API behind the official web app and the
//    pyasassn client (asassn-lb01.ifa.hawaii.edu:9006, keyless). Cone search on the input catalog,
//    then the light curve by asas_sn_id. Not used: the older Photometry Database at
//    asas-sn.osu.edu/photometry, whose robots.txt disallows automated access.
//  - ATLAS forced photometry (Shingles et al. 2021) needs a registered account's API token: read
//    from ATLAS_API_TOKEN on the server, and the lookup throws (check "not run") without one.
// Each lookup throws on failure, like the other archive lookups.
import { BaryState, Body } from "astronomy-engine";
import { getText } from "@/lib/http";
import type { ZtfPoint } from "./archives";

export type GroundPhot = {
  survey: "ASAS-SN" | "ATLAS";
  /** ASAS-SN "V" | "g"; ATLAS "c" | "o". */
  band: string;
  /** ASAS-SN camera (e.g. "bf"), ATLAS unit (e.g. "02a"): each has its own zero point. */
  camera: string;
  /** BTJD (BJD_TDB − 2457000). */
  t: number[];
  mag: number[];
  err: number[];
};

const SKYPATROL = "http://asassn-lb01.ifa.hawaii.edu:9006";
const ATLAS_FP = "https://fallingstar-data.com/forcedphot";
const UA = "Coordinate/0.1 (CalHacks 13 hackathon project)";

// ── Time ────────────────────────────────────────────────────────────────────

// TAI − UTC (s) from each leap second's MJD; both surveys post-date 2009.
const LEAPS: [number, number][] = [[57754, 37], [57204, 36], [56109, 35], [54832, 34]];
/** TDB − UTC in days (TT − UTC; TDB − TT is under 2 ms). */
export const tdbMinusUtc = (mjd: number) => ((LEAPS.find(([m]) => mjd >= m)?.[1] ?? 33) + 32.184) / 86400;

/** HJD (UTC) → BTJD. HJD and BJD differ only by the Sun's offset from the barycentre (≤ 5 s);
 *  the time scale (UTC → TDB, ~69 s) is the larger term. */
export const hjdToBtjd = (hjd: number) => hjd - 2457000 + tdbMinusUtc(hjd - 2400000.5);

/** Geocentric MJD (UTC) → BTJD: TDB, plus the light time from Earth to the barycentre along the
 *  star's direction (up to ±8.3 min). */
export function mjdToBtjd(mjd: number, ra: number, dec: number): number {
  const r = BaryState(Body.Earth, mjd - 51544.5); // UT days from J2000; EQJ (≈ ICRS) AU
  const d = Math.PI / 180, cd = Math.cos(dec * d);
  const dot = r.x * cd * Math.cos(ra * d) + r.y * cd * Math.sin(ra * d) + r.z * Math.sin(dec * d);
  return mjd + 2400000.5 - 2457000 + tdbMinusUtc(mjd) + (dot * 499.004784) / 86400;
}

// ── Shared ──────────────────────────────────────────────────────────────────

/** Points into per-(band, camera) groups, sorted by time; groups under `min` points are dropped
 *  (too few to set their own baseline). */
export function groupPhot(survey: GroundPhot["survey"], pts: { t: number; mag: number; err: number; band: string; camera: string }[], min = 10): GroundPhot[] {
  const by = new Map<string, GroundPhot>();
  for (const p of [...pts].sort((a, b) => a.t - b.t)) {
    const k = `${p.band}:${p.camera}`;
    let g = by.get(k);
    if (!g) by.set(k, (g = { survey, band: p.band, camera: p.camera, t: [], mag: [], err: [] }));
    g.t.push(p.t); g.mag.push(p.mag); g.err.push(p.err);
  }
  return [...by.values()].filter((g) => g.t.length >= min);
}

/** As ZTF points for ztfSeries / ztfScore / ztfSearch, which group by band:oid and normalise each
 *  group to its own median. The band slot only takes "g" | "r": the bluer bands (V, g, ATLAS c)
 *  go to "g", ATLAS o to "r" (rough colour classes, not the ZTF passbands: don't read ztfDepths'
 *  per-band depths off these as ZTF colours). */
export const toZtfPoints = (groups: GroundPhot[]): ZtfPoint[] =>
  groups.flatMap((g) => g.t.map((t, i) => ({ t, mag: g.mag[i], err: g.err[i], band: g.band === "o" ? "r" as const : "g" as const, oid: `${g.survey}:${g.band}:${g.camera}` })));

const sepArcsec = (ra1: number, de1: number, ra2: number, de2: number) => {
  const d = Math.PI / 180;
  const s = Math.sin(((de2 - de1) * d) / 2) ** 2 + Math.cos(de1 * d) * Math.cos(de2 * d) * Math.sin(((ra2 - ra1) * d) / 2) ** 2;
  return (2 * Math.asin(Math.min(1, Math.sqrt(s)))) / d * 3600;
};

/** Text with a timeout and the caller's abort, no cache: for answers that must not be cached
 *  (a 200 carrying a server error, a queued job's status). */
async function fetchText(url: string, init: RequestInit, signal: AbortSignal, timeoutMs: number): Promise<{ status: number; text: string; headers: Headers }> {
  const res = await fetch(url, { ...init, headers: { "User-Agent": UA, ...(init.headers ?? {}) }, signal: AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) });
  return { status: res.status, text: await res.text(), headers: res.headers };
}

// ── ASAS-SN Sky Patrol v2 ───────────────────────────────────────────────────

/** Nearest Sky Patrol target within `maxArcsec`, preferring the stellar_main entry (built on
 *  ATLAS-REFCAT2) over e.g. a VSX position that sits a fraction of an arcsecond off. */
export function pickSkyPatrolTarget(rows: { asas_sn_id: number | string; ra_deg: number; dec_deg: number; catalog_sources?: string[] }[], ra: number, dec: number, maxArcsec = 3) {
  const near = rows.map((r) => ({ id: String(r.asas_sn_id), sep: sepArcsec(ra, dec, r.ra_deg, r.dec_deg), main: !!r.catalog_sources?.includes("stellar_main") })).filter((r) => r.sep <= maxArcsec);
  near.sort((a, b) => Number(b.main) - Number(a.main) || a.sep - b.sep);
  return near[0];
}

// Sky Patrol's V-band cameras (the original 2012-2018 units); every later camera observes in g.
// The web app reads the filter off the image id's first two letters the same way (case matters:
// its list is lower-case only, and v1 names V cameras "bf", "bh").
const V_CAMERAS = new Set(["ba", "bb", "bc", "bd", "be", "bf", "bg", "bh"]);

/** Sky Patrol v2 `get_lightcurve` JSON ({ light_curve: { columns, data } }) → points. Keeps what
 *  the web app plots: quality "G" detections; mag_err ≥ 99 rows are upper limits. Times are
 *  HJD (UTC). */
export function parseSkyPatrol(text: string) {
  const j = JSON.parse(text.replace(/([[,:]\s*)(-?\d{16,})(?=\s*[,\]}])/g, '$1"$2"')) as { error?: string; light_curve?: { columns: string[]; data: unknown[][] } };
  if (j.error) throw new Error(`Sky Patrol: ${j.error}`);
  const cols = j.light_curve?.columns, data = j.light_curve?.data;
  if (!Array.isArray(cols) || !Array.isArray(data)) throw new Error("unexpected Sky Patrol response");
  const ix = (...ks: string[]) => cols.findIndex((c) => ks.includes(c));
  const [it, im, ie, iq, ii, ic, ifl] = [ix("jd", "hjd"), ix("mag"), ix("mag_err"), ix("quality"), ix("image_id"), ix("camera", "cam"), ix("phot_filter", "filter")];
  if (it < 0 || im < 0 || ie < 0) throw new Error("unexpected Sky Patrol columns");
  return data.flatMap((r) => {
    const t = Number(r[it]), mag = Number(r[im]), err = Number(r[ie]);
    if (r[it] == null || r[im] == null || r[ie] == null || !Number.isFinite(t) || !Number.isFinite(mag) || !(err > 0) || err >= 99) return [];
    if (iq >= 0 && r[iq] !== "G") return [];
    const img = ii >= 0 && typeof r[ii] === "string" ? (r[ii] as string) : "";
    const camera = (ic >= 0 && typeof r[ic] === "string" && r[ic]) || img.slice(0, 2) || "?";
    const band = ifl >= 0 && (r[ifl] === "V" || r[ifl] === "g") ? (r[ifl] as string) : V_CAMERAS.has(camera.slice(0, 2)) ? "V" : "g";
    return [{ t: hjdToBtjd(t), mag, err, band, camera }];
  });
}

async function skyPatrol(ra: number, dec: number, signal: AbortSignal) {
  const body = JSON.stringify({ catalog: "master_list", cols: ["asas_sn_id", "ra_deg", "dec_deg", "catalog_sources"], format: "json", page_num: 0, n_rows: 20 });
  const cone = JSON.parse(await getText(`${SKYPATROL}/lookup_cone/radius${(5 / 3600).toFixed(6)}_ra${ra.toFixed(6)}_dec${dec.toFixed(6)}`, { timeoutMs: 20_000, signal, retries: 1, init: { method: "POST", body, headers: { "Content-Type": "application/json" } } })) as { data?: { asas_sn_id: number; ra_deg: number; dec_deg: number; catalog_sources?: string[] }[] };
  if (!Array.isArray(cone.data)) throw new Error("unexpected Sky Patrol cone response");
  const hit = pickSkyPatrolTarget(cone.data, ra, dec);
  if (!hit) return [];
  // Straight fetch: while the light-curve servers are down this endpoint answers 200 with an
  // error body, which the shared cache would keep as a result.
  const r = await fetchText(`${SKYPATROL}/get_lightcurve/${hit.id}`, { headers: { "Content-Type": "application/json" } }, signal, 60_000);
  if (r.status !== 200) throw new Error(`${r.status} from Sky Patrol`);
  return parseSkyPatrol(r.text);
}

// ── ASAS-SN Photometry Database (v1) ────────────────────────────────────────

/** ASAS-SN Sky Patrol v2 light curve at a position (nearest source within 3″), per band and camera.
 *  Empty when there's no source. */
export async function asassnLightCurve(ra: number, dec: number, signal: AbortSignal): Promise<GroundPhot[]> {
  return groupPhot("ASAS-SN", await skyPatrol(ra, dec, signal));
}

// ── ATLAS forced photometry ─────────────────────────────────────────────────

export const atlasConfigured = () => !!process.env.ATLAS_API_TOKEN;

const inRange = (v: number, lo: number, hi: number) => v > lo && v < hi;

/** ATLAS forced-photometry text → points. MJD is the start of a 30 s exposure, geocentric UTC.
 *  Cuts are the server FAQ's "common sense" filters (tphot error code, chip edges, PSF shape,
 *  aperture correction, depth and sky brightness), plus a 3σ detection: fluxes below that are
 *  upper limits in effect, and their magnitudes meaningless. */
export function parseAtlas(text: string, ra: number, dec: number) {
  const lines = text.trim().split(/\r?\n/);
  const head = lines[0]?.replace(/^#+/, "").trim().split(/\s+/).map((s) => s.toLowerCase()) ?? [];
  const ix = (k: string) => head.indexOf(k);
  const I = { mjd: ix("mjd"), ujy: ix("ujy"), dujy: ix("dujy"), f: ix("f"), err: ix("err"), x: ix("x"), y: ix("y"), maj: ix("maj"), min: ix("min"), apfit: ix("apfit"), m5: ix("mag5sig"), sky: ix("sky"), obs: ix("obs") };
  if (I.mjd < 0 || I.ujy < 0 || I.dujy < 0 || I.f < 0) throw new Error("unexpected ATLAS response");
  const opt = (c: string[], i: number, dflt: number) => (i < 0 ? dflt : Number(c[i]));
  return lines.slice(1).flatMap((l) => {
    if (l.startsWith("#")) return [];
    const c = l.trim().split(/\s+/);
    const mjd = Number(c[I.mjd]), f = Number(c[I.ujy]), df = Number(c[I.dujy]), band = c[I.f];
    if (!Number.isFinite(mjd) || !(df > 0) || df >= 10_000 || !(f / df > 3) || (band !== "c" && band !== "o")) return [];
    if (opt(c, I.err, 0) !== 0) return [];
    if (!inRange(opt(c, I.x, 5000), 100, 10460) || !inRange(opt(c, I.y, 5000), 100, 10460)) return [];
    if (!inRange(opt(c, I.maj, 2), 1.6, 5) || !inRange(opt(c, I.min, 2), 1.6, 5) || !inRange(opt(c, I.apfit, -0.5), -1, -0.1)) return [];
    if (!(opt(c, I.m5, 20) > 17) || !(opt(c, I.sky, 20) > 17)) return [];
    const camera = I.obs >= 0 ? (c[I.obs] ?? "").slice(0, 3) || "?" : "?";
    return [{ t: mjdToBtjd(mjd + 15 / 86400, ra, dec), mag: 23.9 - 2.5 * Math.log10(f), err: (2.5 / Math.LN10) * (df / f), band, camera }];
  });
}

const atlasMemo = new Map<string, { at: number; data: Promise<GroundPhot[]> }>();

/** ATLAS forced photometry on the reduced (not difference) images, so magnitudes are the star's own,
 *  over the survey's whole history. A queued job on a volunteer-run server: submit (honouring
 *  429 Retry-After), poll every `pollMs` (the API guide's 10 s) until done or `budgetMs` runs out,
 *  fetch, then delete the task as the guide does. Results are memoised in-process for 6 h so
 *  repeat runs don't queue the same job again. Throws without ATLAS_API_TOKEN. */
export async function atlasLightCurve(ra: number, dec: number, signal: AbortSignal, opts: { token?: string; budgetMs?: number; pollMs?: number } = {}): Promise<GroundPhot[]> {
  const token = opts.token ?? process.env.ATLAS_API_TOKEN;
  if (!token) throw new Error("ATLAS forced photometry needs ATLAS_API_TOKEN (a free fallingstar-data.com account)");
  const key = `${ra.toFixed(5)},${dec.toFixed(5)}`, hit = atlasMemo.get(key);
  if (hit && Date.now() - hit.at < 6 * 3600_000) return hit.data;
  const data = atlasJob(ra, dec, token, signal, opts.budgetMs ?? 300_000, opts.pollMs ?? 10_000).then((pts) => groupPhot("ATLAS", pts));
  atlasMemo.set(key, { at: Date.now(), data });
  data.catch(() => atlasMemo.delete(key));
  return data;
}

async function atlasJob(ra: number, dec: number, token: string, signal: AbortSignal, budgetMs: number, pollMs: number) {
  const deadline = Date.now() + budgetMs;
  const headers = { Authorization: `Token ${token}`, Accept: "application/json" };
  const wait = (ms: number) => new Promise<void>((res, rej) => {
    if (Date.now() + ms > deadline) return rej(new Error("ATLAS job did not finish within the time budget"));
    const onAbort = () => { clearTimeout(t); rej(signal.reason ?? new Error("aborted")); };
    const t = setTimeout(() => { signal.removeEventListener("abort", onAbort); res(); }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
  let taskUrl: string | undefined;
  while (!taskUrl) {
    // mjd_min before ATLAS's first light, so the whole history comes back.
    const r = await fetchText(`${ATLAS_FP}/queue/`, { method: "POST", headers, body: new URLSearchParams({ ra: String(ra), dec: String(dec), mjd_min: "57000", use_reduced: "true", send_email: "false" }) }, signal, 30_000);
    if (r.status === 201) taskUrl = (JSON.parse(r.text) as { url?: string }).url;
    else if (r.status === 429) await wait(1000 * Math.max(1, Number(r.headers.get("Retry-After")) || 10));
    else throw new Error(`${r.status} from ATLAS forced photometry${r.status === 401 || r.status === 403 ? " (token rejected)" : ""}`);
    if (r.status === 201 && !taskUrl) throw new Error("unexpected ATLAS queue response");
  }
  try {
    for (;;) {
      const r = await fetchText(taskUrl, { headers }, signal, 30_000);
      if (r.status !== 200) throw new Error(`${r.status} from ATLAS task`);
      const s = JSON.parse(r.text) as { finishtimestamp?: string | null; result_url?: string | null; error_msg?: string | null };
      if (s.finishtimestamp) {
        if (s.error_msg) throw new Error(`ATLAS: ${s.error_msg}`);
        if (!s.result_url) return [];
        const res = await fetchText(s.result_url, { headers }, signal, 60_000);
        if (res.status !== 200) throw new Error(`${res.status} from ATLAS result`);
        return parseAtlas(res.text, ra, dec);
      }
      await wait(pollMs);
    }
  } finally {
    // Tidy the user's queue (the guide's last step); best effort, even after a failure.
    void fetch(taskUrl, { method: "DELETE", headers: { ...headers, "User-Agent": UA } }).catch(() => {});
  }
}
