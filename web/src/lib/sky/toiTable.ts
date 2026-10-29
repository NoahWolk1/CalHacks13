// ExoFOP's TOI table: one ~4 MB CSV of every TOI with its ephemeris, disposition and (for known
// planets) the planet's name, cached per process. The fallback when the NASA Exoplanet Archive is
// down: its whole host answers 502 for hours at a time, and its TOI table is a copy of this one.
import { getText } from "@/lib/http";
import { parseCsv } from "./csv";
import { separation } from "./geom";
import type { Cone } from "./types";

export const EXOFOP_TOI_CSV = "https://exofop.ipac.caltech.edu/tess/download_toi.php?sort=toi&output=csv";

export type ToiRow = {
  tic: string; toi: string; disposition: string; planet?: string; ra: number; dec: number;
  period?: number; periodErr?: number; epoch?: number /* BJD */; epochErr?: number; durationH?: number; radius?: number; distance?: number; tmag?: number;
};

const num = (v?: string) => { const n = v === undefined || v.trim() === "" ? NaN : Number(v); return Number.isFinite(n) ? n : undefined; };

/** "21:14:56.88" (hours or degrees) or plain degrees. */
export function sexagesimal(v: string, hours: boolean): number | undefined {
  const s = v.trim();
  if (!s.includes(":")) return num(s);
  const [a, b = "0", c = "0"] = s.split(":");
  const neg = a.trim().startsWith("-");
  const x = Math.abs(Number(a)) + Number(b) / 60 + Number(c) / 3600;
  return Number.isFinite(x) ? (neg ? -x : x) * (hours ? 15 : 1) : undefined;
}

/** ExoFOP leaves "Planet Name" empty and writes a known planet's name at the start of the free-text
 *  comments ("WASP-46 b", "L 98-59 d/TOI 175.02", "TOI-561 b / .02"); anything else isn't a name. */
export function planetName(comment: string): string | undefined {
  return /^([A-Za-z][\w+.\- ]*?\d[\w+.\-]* ?[b-k])(?=$|[\s/;,(])/.exec(comment.trim())?.[1];
}

export function parseToiTable(csv: string): ToiRow[] {
  const rows = parseCsv(csv);
  if (!rows.length || !("TIC ID" in rows[0]) || !("Epoch (BJD)" in rows[0])) throw new Error("unexpected ExoFOP TOI table");
  return rows.flatMap((r) => {
    const ra = sexagesimal(r.RA ?? "", true), dec = sexagesimal(r.Dec ?? "", false);
    if (!r["TIC ID"] || ra === undefined || dec === undefined) return [];
    const disp = (r["TFOPWG Disposition"] || r["TESS Disposition"] || "").trim();
    const planet = r["Planet Name"]?.trim() || (/^(KP|CP)$/.test(disp) ? planetName(r.Comments ?? "") : undefined);
    return [{
      tic: r["TIC ID"].trim(), toi: r.TOI.trim(), disposition: disp, ...(planet ? { planet } : {}), ra, dec,
      period: num(r["Period (days)"]), periodErr: num(r["Period (days) err"]), epoch: num(r["Epoch (BJD)"]), epochErr: num(r["Epoch (BJD) err"]),
      durationH: num(r["Duration (hours)"]), radius: num(r["Planet Radius (R_Earth)"]), distance: num(r["Stellar Distance (pc)"]), tmag: num(r["TESS Mag"]),
    }];
  });
}

const g = globalThis as unknown as { __exofopTois?: { at: number; p: Promise<ToiRow[]> } };
const TTL_MS = 6 * 3600_000;

/** The whole table (~20 s to download, then shared by every caller in this process for 6 h). */
export function exofopTois(signal: AbortSignal): Promise<ToiRow[]> {
  if (!g.__exofopTois || Date.now() - g.__exofopTois.at > TTL_MS) {
    // Not tied to one caller's signal: a run that gives up shouldn't abort the shared download.
    const p = getText(EXOFOP_TOI_CSV, { timeoutMs: 60_000, signal: AbortSignal.timeout(65_000), retries: 1 }).then(parseToiTable);
    g.__exofopTois = { at: Date.now(), p };
    p.catch(() => { if (g.__exofopTois?.p === p) g.__exofopTois = undefined; });
  }
  const p = g.__exofopTois.p;
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    p.then(resolve, reject);
  });
}

export async function exofopToisNear(c: Cone, signal: AbortSignal): Promise<ToiRow[]> {
  return (await exofopTois(signal)).filter((r) => separation(c.ra, c.dec, r.ra, r.dec) <= c.radius);
}
