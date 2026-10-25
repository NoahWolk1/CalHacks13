import type { Worker } from "@/lib/types";
import { touchesSF } from "@/lib/geo";
import { sleep } from "@/lib/http";
import { clamp01, datasetUrl, daysAgo, fmt, month, num, pct, soda, title, within, pt, sodaUrl } from "./sfdata";

// SF Assessor secured property tax roll (DataSF). One row per parcel per closed roll year.
// Prop 13: assessed value resets to the sale price at each sale, so parcels sold recently carry a
// near-market value; long-held parcels are far below market. That makes "recently sold" a sales proxy.
const ID = "wv5m-vpq2";

interface Parcel {
  parcel_number: string; property_location?: string; use_definition?: string; property_class_code_definition?: string; year_property_built?: string;
  number_of_stories?: string; number_of_units?: string; property_area?: string; lot_area?: string; zoning_code?: string; current_sales_date?: string;
  assessed_land_value?: string; assessed_improvement_value?: string; the_geom?: { type: "Point"; coordinates: [number, number] };
}
const value = (p: Parcel) => num(p.assessed_land_value) + num(p.assessed_improvement_value);
/** "2631 2629 19TH      ST0000" → "2631 19th St". */
function addr(s?: string) {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  const m = t.match(/^(\d+[A-Z]?) (\d+[A-Z]?) (.*?)(\d{4})?$/);
  if (!m) return title(t);
  const no = /^0+$/.test(m[1]) ? m[2] : m[1];
  return `${no.replace(/^0+(?=\d)/, "")} ${title(m[3].trim())}${m[4] && !/^0+$/.test(m[4]) ? ` #${m[4].replace(/^0+/, "")}` : ""}`;
}
const money = (n: number) => (n >= 1e9 ? `$${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : `$${fmt(n / 1e3)}K`);
const CITY_FALLBACK = [{ m: "516" }];
const SEL = "parcel_number, property_location, use_definition, property_class_code_definition, year_property_built, number_of_stories, number_of_units, property_area, lot_area, zoning_code, current_sales_date, assessed_land_value, assessed_improvement_value, the_geom";

export const propertyWorker: Worker = {
  id: "sf-property",
  name: "Assessor's Ledger",
  description: "SF Assessor secured roll: parcel count, median assessed value per sq ft vs. SF, land-use mix, sales in the last ~3 years (Prop 13 reassessment = sale-price proxy) with median $/sq ft, and pins for top recent sales and the tallest buildings. San Francisco only.",
  vehicle: "car",
  color: "#cdb59a",
  tools: ["http_get"],
  dataSources: ["SF Assessor Historical Secured Property Tax Rolls (DataSF wv5m-vpq2)"],
  coverage: "San Francisco",
  builtin: true,
  async run({ task, emit, log, signal }) {
    const r = task.region;
    if (!touchesSF(r)) { log("Outside San Francisco: no SF Assessor roll here."); return; }
    const latest = await soda<{ y: string }[]>(ID, { $select: "max(closed_roll_year) as y" }, signal);
    const year = num(latest[0]?.y) || 2025;
    const base = `closed_roll_year=${year}`;
    const geo = `${base} AND ${within("the_geom", r)}`;
    const soldSince = daysAgo(3 * 365);
    const sold = `${geo} AND current_sales_date > '${soldSince}'`;
    const psf = "median((assessed_land_value + assessed_improvement_value) / property_area)";
    log(`Reading the ${year} assessor roll…`);
    const [agg, aggSold, city, uses, topSales, tallest] = await Promise.all([
      soda<{ n: string; m?: string; v?: string; u?: string; yb?: string }[]>(ID, { $select: `count(*) as n, ${psf} as m, sum(assessed_land_value + assessed_improvement_value) as v, sum(number_of_units) as u`, $where: `${geo} AND property_area > 200` }, signal, 12_000),
      soda<{ n: string; m?: string }[]>(ID, { $select: `count(*) as n, ${psf} as m`, $where: `${sold} AND property_area > 200` }, signal, 12_000),
      // Citywide median scans ~200k rows (~7 s cold). Don't block on it: fall back to the value measured
      // for the 2025 roll; the request keeps going and lands in the disk cache for the next run.
      Promise.race([
        soda<{ m?: string }[]>(ID, { $select: `${psf} as m`, $where: `${base} AND property_area > 200` }, signal, 12_000).catch(() => CITY_FALLBACK),
        sleep(5_000).then(() => CITY_FALLBACK),
      ]),
      soda<{ u?: string; n: string }[]>(ID, { $select: "use_definition as u, count(*) as n", $where: geo, $group: "u", $order: "n DESC", $limit: "8" }, signal, 12_000),
      soda<Parcel[]>(ID, { $select: SEL, $where: `${sold} AND the_geom IS NOT NULL`, $order: "assessed_land_value + assessed_improvement_value DESC", $limit: "10" }, signal, 12_000),
      // Ordering by stories server-side is slow (~10 s); filter to 4+ stories and sort here.
      soda<Parcel[]>(ID, { $select: SEL, $where: `${geo} AND the_geom IS NOT NULL AND number_of_stories >= 4 AND number_of_stories <= 70`, $limit: "1500" }, signal, 12_000),
    ]);
    const n = num(agg[0]?.n), m = num(agg[0]?.m), cityM = num(city[0]?.m), nSold = num(aggSold[0]?.n), mSold = num(aggSold[0]?.m);
    const totalUses = uses.reduce((s, u) => s + num(u.n), 0);
    log(`${fmt(n)} parcels; ${nSold} sold in 2 years`);
    if (!n) return;
    const ratio = cityM ? m / cityM : 1;
    emit({
      claim: `${fmt(n)} assessed parcels (${year} roll), median $${fmt(m)}/sq ft assessed (${ratio >= 1 ? `${ratio.toFixed(2)}× the SF median $${fmt(cityM)}` : `${Math.round(100 * (1 - ratio))}% below the SF median $${fmt(cityM)}`}); total ${money(num(agg[0]?.v))}. Land use: ${uses.slice(0, 4).map((u) => `${u.u ?? "Other"} ${pct(num(u.n), totalUses)}`).join(", ")}`,
      geometry: pt(...r.center), source_url: datasetUrl(ID), source_type: "assessor_aggregate", observed_at: `${year}-07-01`,
      confidence: 0.85, category: "property", severity: clamp01(0.25 + 0.3 * ratio),
      props: { areaLevel: true, rollYear: year, parcels: n, medianAssessedPerSqft: Math.round(m), cityMedianPerSqft: Math.round(cityM), totalAssessed: num(agg[0]?.v), units: num(agg[0]?.u), uses: Object.fromEntries(uses.map((u) => [u.u ?? "Other", num(u.n)])) },
    });
    if (nSold) {
      emit({
        claim: `${nSold} parcels sold since ${month(soldSince)} (${year} roll); their reassessed (≈ sale price) median is $${fmt(mSold)}/sq ft, ${m ? `${(mSold / m).toFixed(1)}× the area's long-held median` : ""}`,
        geometry: pt(...r.center), source_url: sodaUrl(ID, { $where: sold, $order: "current_sales_date DESC" }), source_type: "assessor_sales_proxy", observed_at: `${year}-07-01`,
        confidence: 0.7, category: "property", severity: clamp01(0.3 + mSold / 3000), props: { areaLevel: true, salesProxy: true, soldSince: soldSince.slice(0, 10), sold: nSold, medianSalePerSqft: Math.round(mSold) },
      });
    }
    const pin = (p: Parcel, claim: string, sev: number, tag: string) => emit({
      claim, geometry: p.the_geom!, source_url: sodaUrl(ID, { parcel_number: p.parcel_number, closed_roll_year: String(year) }), source_type: "assessor_parcel",
      observed_at: p.current_sales_date?.slice(0, 10) ?? `${year}-07-01`, confidence: 0.8, category: "property", severity: sev,
      props: { [tag]: true, apn: p.parcel_number, use: p.use_definition, class: p.property_class_code_definition, stories: num(p.number_of_stories), units: num(p.number_of_units), sqft: num(p.property_area), lotSqft: num(p.lot_area), built: p.year_property_built, zoning: p.zoning_code, assessed: value(p), lastSale: p.current_sales_date?.slice(0, 10) },
    });
    const seen = new Set<string>();
    for (const p of topSales.slice(0, 8)) {
      seen.add(p.parcel_number);
      const sq = num(p.property_area);
      pin(p, `Sold ${month(p.current_sales_date)}: ${addr(p.property_location)}, ${title(p.property_class_code_definition ?? p.use_definition)}, reassessed ${money(value(p))}${sq > 200 ? ` ($${fmt(value(p) / sq)}/sq ft)` : ""}`, clamp01(0.4 + value(p) / 3e7), "recentSale");
    }
    let t = 0;
    const addrs = new Set<string>(); // condo units are separate parcels in the same building
    for (const p of tallest.sort((x, y) => num(y.number_of_stories) - num(x.number_of_stories))) {
      const key = addr(p.property_location).replace(/ #.*/, "");
      if (seen.has(p.parcel_number) || addrs.has(key) || t >= 5) continue;
      seen.add(p.parcel_number); addrs.add(key); t++;
      pin(p, `Tallest: ${addr(p.property_location)}, ${num(p.number_of_stories)} stories${num(p.number_of_units) ? `, ${num(p.number_of_units)} units` : ""} (${title(p.use_definition)}, built ${p.year_property_built ?? "?"})`, clamp01(0.3 + num(p.number_of_stories) / 40), "tallest");
    }
  },
};
