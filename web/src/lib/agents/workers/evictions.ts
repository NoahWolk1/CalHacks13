import type { Worker } from "@/lib/types";
import { touchesSF } from "@/lib/geo";
import { clamp01, datasetUrl, daysAgo, day, fmt, month, num, ratioText, recordUrl, soda, title, vsCity, within, pt } from "./sfdata";

// Eviction notices filed with the SF Rent Board (DataSF). Addresses are block-level; updated weekly.
const ID = "5cei-gny5";
// Flag columns, most "no-fault"/displacement-relevant first.
const REASONS: [col: string, label: string, noFault: boolean][] = [
  ["ellis_act_withdrawal", "Ellis Act withdrawal", true],
  ["owner_move_in", "Owner move-in", true],
  ["demolition", "Demolition", true],
  ["condo_conversion", "Condo conversion", true],
  ["capital_improvement", "Capital improvement", true],
  ["substantial_rehab", "Substantial rehab", true],
  ["development", "Development agreement", true],
  ["lead_remediation", "Lead remediation", true],
  ["non_payment", "Non-payment", false],
  ["breach", "Breach of lease", false],
  ["nuisance", "Nuisance", false],
  ["illegal_use", "Illegal use", false],
  ["late_payments", "Late payments", false],
  ["unapproved_subtenant", "Unapproved subtenant", false],
  ["access_denial", "Access denial", false],
  ["roommate_same_unit", "Roommate in same unit", false],
  ["failure_to_sign_renewal", "Failure to sign renewal", false],
  ["other_cause", "Other cause", false],
];
const NO_FAULT = REASONS.filter((x) => x[2]).map((x) => x[0]);

type Row = { eviction_id: string; address?: string; file_date: string; neighborhood?: string; shape?: { type: "Point"; coordinates: [number, number] } } & Record<string, unknown>;

export const evictionsWorker: Worker = {
  id: "sf-evictions",
  name: "Tenant Watch",
  description: "Eviction notices filed with the SF Rent Board over the last 3 years: totals vs. the SF average, no-fault (Ellis Act, owner move-in, demolition) vs. at-fault, yearly trend, and pins for no-fault notices. San Francisco only.",
  vehicle: "car",
  color: "#c3a3d6",
  tools: ["http_get"],
  dataSources: ["SF Rent Board Eviction Notices (DataSF 5cei-gny5)"],
  coverage: "San Francisco",
  builtin: true,
  async run({ task, emit, log, signal }) {
    const r = task.region;
    if (!touchesSF(r)) { log("Outside San Francisco: no Rent Board eviction data here."); return; }
    const since = daysAgo(3 * 365);
    const geo = `${within("shape", r)} AND file_date > '${since}'`;
    const sums = REASONS.map(([c]) => `sum(case(${c}, 1, true, 0)) as ${c}`).join(", ");
    log("Reading 3 years of Rent Board eviction notices…");
    const [agg, byYear, city, rows] = await Promise.all([
      soda<Record<string, string>[]>(ID, { $select: `count(*) as n, ${sums}`, $where: geo }, signal),
      soda<{ y: string; n: string }[]>(ID, { $select: "date_extract_y(file_date) as y, count(*) as n", $where: geo, $group: "y", $order: "y" }, signal),
      soda<{ n: string }[]>(ID, { $select: "count(*) as n", $where: `file_date > '${since}'` }, signal),
      soda<Row[]>(ID, { $where: `${geo} AND shape IS NOT NULL AND (${NO_FAULT.map((c) => `${c}=true`).join(" OR ")})`, $order: "file_date DESC", $limit: "40" }, signal),
    ]);
    const a = agg[0] ?? {};
    const total = num(a.n);
    log(`${total} notices since ${since.slice(0, 10)}`);
    if (!total) {
      emit({ claim: "No eviction notices filed in this area in the last 3 years", geometry: pt(...r.center), source_url: datasetUrl(ID), source_type: "eviction_aggregate", observed_at: day(new Date().toISOString()), confidence: 0.7, category: "eviction", severity: 0.1, props: { areaLevel: true, total: 0 } });
      return;
    }
    const counts = REASONS.map(([c, label, nf]) => ({ c, label, nf, n: num(a[c]) })).filter((x) => x.n > 0).sort((x, y) => y.n - x.n);
    const noFault = counts.filter((x) => x.nf).reduce((s, x) => s + x.n, 0);
    const cmp = vsCity(total, num(city[0]?.n), r);
    const ellis = num(a.ellis_act_withdrawal), omi = num(a.owner_move_in);
    emit({
      claim: `${fmt(total)} eviction notices in 3 years (${ratioText(cmp.ratio)}); ${fmt(ellis)} Ellis Act, ${fmt(omi)} owner move-in. Top reasons: ${counts.slice(0, 4).map((x) => `${x.label} (${x.n})`).join(", ")}. By year: ${byYear.map((y) => `${y.y}: ${y.n}`).join(", ")}`,
      geometry: pt(...r.center), source_url: datasetUrl(ID), source_type: "eviction_aggregate", observed_at: day(new Date().toISOString()),
      confidence: 0.85, category: "eviction", severity: clamp01(0.2 + 0.2 * cmp.ratio + (ellis + omi) / 60),
      props: { areaLevel: true, total, noFault, ellis, ownerMoveIn: omi, ratioVsCity: +cmp.ratio.toFixed(2), byYear: Object.fromEntries(byYear.map((y) => [y.y, num(y.n)])), reasons: Object.fromEntries(counts.map((x) => [x.label, x.n])) },
    });

    let n = 0;
    for (const x of rows) {
      if (!x.shape || n >= 25) continue;
      const reasons = REASONS.filter(([c]) => x[c] === true).map(([, l]) => l);
      n++;
      const ellisRow = x.ellis_act_withdrawal === true;
      emit({
        claim: `${reasons.join(" + ")} eviction notice, ${title(x.address)} (${month(x.file_date)})`,
        geometry: x.shape, source_url: recordUrl(ID, "eviction_id", x.eviction_id), source_type: "eviction_notice", observed_at: day(x.file_date),
        confidence: 0.8, category: "eviction", severity: ellisRow ? 0.7 : 0.55,
        props: { evictionId: x.eviction_id, reasons, noFault: true, neighborhood: x.neighborhood, blockLevelAddress: true },
      });
    }
  },
};
