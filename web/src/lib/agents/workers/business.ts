import type { Worker } from "@/lib/types";
import { touchesSF } from "@/lib/geo";
import { clamp01, datasetUrl, daysAgo, day, fmt, month, num, recordUrl, soda, title, todayIso, within, pt } from "./sfdata";

// Registered Business Locations (SF Treasurer & Tax Collector via DataSF). Updated daily.
// location_start_date / location_end_date mark a business opening/closing at that address.
const ID = "g8m3-pdis";

// 2-digit NAICS sector names (self-reported, so noisy, but good for a mix/churn picture).
const SECTORS: Record<string, string> = {
  "11": "Agriculture", "21": "Mining", "22": "Utilities", "23": "Construction", "31": "Manufacturing", "32": "Manufacturing", "33": "Manufacturing",
  "42": "Wholesale", "44": "Retail", "45": "Retail", "48": "Transport", "49": "Transport", "51": "Information", "52": "Finance & insurance",
  "53": "Real estate & rentals", "54": "Professional services", "55": "Management", "56": "Admin & support", "61": "Education", "62": "Health care",
  "71": "Arts & recreation", "72": "Food & drink / lodging", "81": "Personal & other services", "92": "Public admin",
};
/** Sectors that typically occupy a street-front space. */
const STOREFRONT = new Set(["44", "45", "72", "81", "71"]);
const sectorOf = (code?: string) => SECTORS[(code ?? "").replace(/\D/g, "").slice(0, 2)] ?? "Sector not reported";

interface Row {
  uniqueid: string; dba_name?: string; ownership_name?: string; full_business_address?: string; self_reported_naics_code?: string; lic_code_description?: string;
  location_start_date?: string; location_end_date?: string; business_corridor?: string; location?: { type: "Point"; coordinates: [number, number] };
}

export const businessWorker: Worker = {
  id: "sf-business",
  name: "Storefront Census",
  description: "Registered business locations: how many are active, openings vs. closures in the last 12 months by NAICS sector (retail, food & drink, services), net churn, and pins for recent storefront openings/closures. San Francisco only.",
  vehicle: "car",
  color: "#b9cf9a",
  tools: ["http_get"],
  dataSources: ["SF Registered Business Locations (DataSF g8m3-pdis)"],
  coverage: "San Francisco",
  builtin: true,
  async run({ task, emit, log, signal }) {
    const r = task.region;
    if (!touchesSF(r)) { log("Outside San Francisco: no business registry here."); return; }
    const since = daysAgo(365), now = todayIso();
    const geo = within("location", r);
    const opened = `${geo} AND location_start_date > '${since}' AND location_start_date <= '${now}'`;
    const closed = `${geo} AND location_end_date > '${since}' AND location_end_date <= '${now}'`;
    const byCode = (where: string) => soda<{ c?: string; n: string }[]>(ID, { $select: "self_reported_naics_code as c, count(*) as n", $where: where, $group: "c", $limit: "500" }, signal);
    log("Counting business openings and closures over 12 months…");
    const [active, opens, closes, newRows, goneRows] = await Promise.all([
      soda<{ n: string }[]>(ID, { $select: "count(*) as n", $where: `${geo} AND location_end_date IS NULL` }, signal),
      byCode(opened), byCode(closed),
      soda<Row[]>(ID, { $where: `${opened} AND location IS NOT NULL`, $order: "location_start_date DESC", $limit: "200" }, signal),
      soda<Row[]>(ID, { $where: `${closed} AND location IS NOT NULL`, $order: "location_end_date DESC", $limit: "200" }, signal),
    ]);
    const tally = (rows: { c?: string; n: string }[]) => {
      const m = new Map<string, number>();
      for (const x of rows) m.set(sectorOf(x.c), (m.get(sectorOf(x.c)) ?? 0) + num(x.n));
      return m;
    };
    const o = tally(opens), c = tally(closes);
    const nOpen = [...o.values()].reduce((a, b) => a + b, 0), nClose = [...c.values()].reduce((a, b) => a + b, 0);
    const nActive = num(active[0]?.n);
    log(`${fmt(nActive)} active locations; ${nOpen} opened, ${nClose} closed in 12 months`);
    if (!nActive && !nOpen && !nClose) return;
    const sectors = [...new Set([...o.keys(), ...c.keys()])].map((s) => ({ s, o: o.get(s) ?? 0, c: c.get(s) ?? 0 })).sort((a, b) => b.o + b.c - (a.o + a.c));
    const net = nOpen - nClose;
    const churn = nActive ? (nOpen + nClose) / nActive : 0;
    emit({
      claim: `${fmt(nActive)} active business locations. Last 12 months: ${fmt(nOpen)} opened, ${fmt(nClose)} closed (net ${net >= 0 ? "+" : ""}${fmt(net)}). Busiest sectors: ${sectors.filter((x) => x.s !== "Sector not reported").slice(0, 4).map((x) => `${x.s} +${x.o}/−${x.c}`).join(", ")}`,
      geometry: pt(...r.center), source_url: datasetUrl(ID), source_type: "business_registry_aggregate", observed_at: day(now),
      confidence: 0.8, category: "business", severity: clamp01(0.3 + Math.abs(net) / Math.max(40, nActive * 0.05) * 0.3 + churn),
      props: { areaLevel: true, active: nActive, opened12mo: nOpen, closed12mo: nClose, net, churnRate: +churn.toFixed(3), bySector: Object.fromEntries(sectors.map((x) => [x.s, { opened: x.o, closed: x.c }])) },
    });

    // Storefront sectors on their own: the number a café/retail scout actually wants.
    const sf = sectors.filter((x) => ["Retail", "Food & drink / lodging", "Personal & other services", "Arts & recreation"].includes(x.s));
    const so = sf.reduce((a, x) => a + x.o, 0), sc = sf.reduce((a, x) => a + x.c, 0);
    if (so + sc > 0) {
      emit({
        claim: `Storefront churn (retail, food & drink, services): ${so} openings vs ${sc} closures in 12 months (${so >= sc ? "growing" : "shrinking"}, net ${so - sc >= 0 ? "+" : ""}${so - sc})`,
        geometry: pt(...r.center), source_url: datasetUrl(ID), source_type: "business_registry_aggregate", observed_at: day(now),
        confidence: 0.7, category: "business", severity: clamp01(0.35 + Math.abs(so - sc) / 40),
        props: { areaLevel: true, storefront: true, opened: so, closed: sc, net: so - sc, sectors: Object.fromEntries(sf.map((x) => [x.s, { opened: x.o, closed: x.c }])) },
      });
    }

    // Home-based registrations (an "Apt"/"Unit" address) aren't storefronts.
    const storefront = (x: Row) => !/\b(apt|unit|#)\s*\w/i.test(x.full_business_address ?? "") && STOREFRONT.has((x.self_reported_naics_code ?? "").slice(0, 2)) || /restaurant|bar|retail|food|liquor/i.test(x.lic_code_description ?? "");
    const pin = (x: Row, kind: "opened" | "closed", max: number, seen: Set<string>) => {
      if (!x.location || seen.size >= max || !x.dba_name) return;
      const key = (x.full_business_address ?? x.dba_name).toLowerCase(); // one pin per storefront address
      if (seen.has(key)) return;
      seen.add(key);
      const when = kind === "opened" ? x.location_start_date : x.location_end_date;
      const what = x.lic_code_description ? title(x.lic_code_description) : sectorOf(x.self_reported_naics_code);
      emit({
        claim: `${kind === "opened" ? "Opened" : "Closed"} ${month(when)}: ${title(x.dba_name)} (${what}), ${title(x.full_business_address)}`,
        geometry: x.location, source_url: recordUrl(ID, "uniqueid", x.uniqueid), source_type: "business_registration", observed_at: day(when),
        confidence: 0.75, category: "business", severity: kind === "closed" ? 0.45 : 0.4,
        props: { event: kind, name: x.dba_name, sector: sectorOf(x.self_reported_naics_code), naics: x.self_reported_naics_code, license: x.lic_code_description, corridor: x.business_corridor },
      });
    };
    const so2 = new Set<string>(), sc2 = new Set<string>();
    for (const x of newRows.filter(storefront)) pin(x, "opened", 14, so2);
    for (const x of goneRows.filter(storefront)) pin(x, "closed", 10, sc2);
  },
};
