// ESA's ESASky TAP: observation tables for HST, JWST, Spitzer, Chandra, XMM-Newton, Herschel, ALMA, IUE
// and CHEOPS behind one service. The Telescope Archive agent uses it when MAST's CAOM position search
// is slow or down (it hangs on its big tables now and then): the rows are reshaped into MAST's columns
// and summarised per mission by the same parseMast, so the result looks the same either way.
import { getText } from "@/lib/http";
import { parseCsv } from "./csv";
import { adqlNum } from "./geom";
import { missionLabel, parseMast } from "./telescopes";
import type { Cone, SkyObject } from "./types";

export { parseCsv };

export const ESASKY_TAP = "https://sky.esa.int/esasky-tap/tap/sync";
const ROWS = 2000;

type Table = {
  mission: string; table: string; ra: string; dec: string;
  /** Column → MAST column (obs_id, target_name, instrument_name, filters, proposal_id). */
  cols: Record<string, string>;
  /** Start time: an ISO date column, or an MJD one. */
  time?: { col: string; mjd?: boolean };
  /** Fixed instrument name when the table has none. */
  instrument?: string;
};

const TABLES: Table[] = [
  { mission: "HST", table: "mv_v_v_hst_mmi_observation_fdw_fdw", ra: "ra_deg", dec: "dec_deg", cols: { observation_id: "obs_id", target_name: "target_name", instrument_name: "instrument_name", filter: "filters" }, time: { col: "start_time" } },
  { mission: "JWST", table: "mv_v_jwst_obs_fdw", ra: "s_ra", dec: "s_dec", cols: { obs_id: "obs_id", target_name: "target_name", instrument_name: "instrument_name" }, time: { col: "t_min", mjd: true } },
  { mission: "SPITZER_SHA", table: "mv_spitzer_irac_fdw", ra: "ra_deg", dec: "dec_deg", cols: { obs_id: "obs_id", instrument: "instrument_name" }, time: { col: "start_time_mjd", mjd: true } },
  { mission: "Chandra", table: "mv_chandra_obs_photo_fdw", ra: "s_ra", dec: "s_dec", cols: { obs_id: "obs_id", target_name: "target_name", instrument_name: "instrument_name", proposal_id: "proposal_id" }, time: { col: "t_min", mjd: true } },
  { mission: "XMM", table: "mv_v_v_xsa_esasky_photo_fdw_fdw", ra: "ra_deg", dec: "dec_deg", cols: { observation_id: "obs_id", target_name: "target_name", instrument: "instrument_name" }, time: { col: "start_time" } },
  { mission: "Herschel", table: "mv_v_v_hsa_esasky_photo_fdw_fdw", ra: "ra_deg", dec: "dec_deg", cols: { observation_id: "obs_id", target_name: "target_name", instrument: "instrument_name", filter: "filters" }, time: { col: "start_time" } },
  { mission: "ALMA", table: "mv_v_v_alma_obs_fdw", ra: "s_ra", dec: "s_dec", cols: { observation_id: "obs_id", target_name: "target_name", band_list: "filters" }, time: { col: "t_min", mjd: true }, instrument: "ALMA" },
  { mission: "IUE", table: "mv_iue_spectra_fdw", ra: "ra_deg", dec: "dec_deg", cols: { observation_id: "obs_id", target_name: "target_name", aperture: "filters" }, time: { col: "start_time" }, instrument: "IUE" },
  { mission: "CHEOPS", table: "mv_cheops_obs_fdw", ra: "ra_deg", dec: "dec_deg", cols: { obs_id: "obs_id", targname: "target_name" }, instrument: "CHEOPS" },
];

export function esaskyQuery(t: Table, c: Cone) {
  const cols = [t.ra, t.dec, ...Object.keys(t.cols), ...(t.time ? [t.time.col] : [])];
  return `SELECT TOP ${ROWS} ${[...new Set(cols)].join(", ")} FROM observations.${t.table} `
    + `WHERE 1 = CONTAINS(POINT('ICRS', ${t.ra}, ${t.dec}), CIRCLE('ICRS', ${adqlNum(c.ra)}, ${adqlNum(c.dec)}, ${adqlNum(c.radius)}))`;
}

const toMjd = (v: string, mjd?: boolean) => {
  if (!v) return undefined;
  if (mjd) { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : undefined; }
  const ms = Date.parse(v.includes("T") || v.includes("Z") ? v : `${v.replace(" ", "T")}Z`);
  return Number.isFinite(ms) ? ms / 86_400_000 + 40587 : undefined;
};

/** One table's rows in MAST's column names. */
export function esaskyRows(t: Table, rows: Record<string, string>[]): Record<string, unknown>[] {
  return rows.map((r) => {
    const out: Record<string, unknown> = { obs_collection: t.mission, s_ra: Number(r[t.ra]), s_dec: Number(r[t.dec]) };
    for (const [from, to] of Object.entries(t.cols)) if (r[from]) out[to] = r[from];
    if (t.instrument && !out.instrument_name) out.instrument_name = t.instrument;
    const tm = t.time ? toMjd(r[t.time.col], t.time.mjd) : undefined;
    if (tm !== undefined) out.t_min = tm;
    return out;
  });
}

export const esaskyUrl = (c: Cone) => `https://sky.esa.int/esasky/?target=${encodeURIComponent(`${c.ra.toFixed(5)} ${c.dec.toFixed(5)}`)}&fov=${Math.max(0.05, 2 * c.radius).toFixed(3)}`;

/** Per-mission observation summaries for the cone from ESASky (missions whose table didn't answer are left out). */
export async function esaskyObservations(c: Cone, signal: AbortSignal, timeoutMs = 10_000): Promise<{ objects: SkyObject[]; failed: string[] }> {
  const failed: string[] = [];
  const all = await Promise.all(TABLES.map(async (t) => {
    try {
      const csv = await getText(`${ESASKY_TAP}?${new URLSearchParams({ REQUEST: "doQuery", LANG: "ADQL", FORMAT: "csv", QUERY: esaskyQuery(t, c) })}`, { timeoutMs, signal, retries: 0 });
      return esaskyRows(t, parseCsv(csv));
    } catch {
      failed.push(t.mission);
      return [];
    }
  }));
  if (failed.length === TABLES.length) throw new Error("ESASky didn't answer");
  // A table that hit the row cap has more: its count reads "2000+".
  const capped = new Set(TABLES.filter((_, i) => all[i].length >= ROWS).map((t) => `${missionLabel(t.mission)} archive`));
  const objects = parseMast({ data: all.flat() }, c, TABLES.length).map((o) => ({
    ...o, url: esaskyUrl(c), props: { ...o.props, ...(capped.has(o.name) ? { observations: `${o.props.observations}+` } : {}), archive: "ESA ESASky" },
  }));
  return { objects, failed };
}
