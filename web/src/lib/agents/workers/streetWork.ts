import type { Worker } from "@/lib/types";
import { touchesSF } from "@/lib/geo";
import { clamp01, datasetUrl, day, fmt, month, num, pt, recordUrl, soda, title, todayIso, within } from "./sfdata";

// SF Public Works street-use permits (all types), active/upcoming street-surface permits (excavation,
// with the contractor/utility name), and the 5-year excavation moratorium on freshly repaved blocks.
const SU = "b6tj-gt35";
const SURFACE = "bpc9-7sus";
const MORATORIUM = "5wbp-dwzt";
const DEAD = "'CLOSED','EXPIRED','VOID','REVOKED','WITHDRAW','CANCELLED','CANCEL','DENIED','INACTIVE'";
const LABEL: Record<string, string> = {
  Excavation: "Excavation", ExcStreet: "Street excavation", StrtImprov: "Street improvement", Boring: "Boring/monitoring well", Wireless: "Wireless facility",
  Parklet: "Parklet", TableChair: "Sidewalk tables & chairs", Display: "Merchandise display", TempOccup: "Temporary occupancy", MinorEnc: "Minor sidewalk encroachment",
  NightNoise: "Night noise", Emergency: "Emergency work", FoodFac: "Food facility", Banners: "Banners", AddlStSpac: "Additional street space", SpecSidewlk: "Special sidewalk",
};

interface Surface {
  permit_number: string; dba_name?: string; street_name?: string; cross_street?: string; permit_type?: string; permit_description?: string; status?: string;
  permit_start_date?: string; permit_end_date?: string; latitude?: string; longitude?: string;
}

export const streetWorkWorker: Worker = {
  id: "sf-street-work",
  name: "Road Crew",
  description: "Street work active right now: Public Works street-use permits by type (excavation, utility/wireless work, parklets, sidewalk dining), who is digging where and until when, and blocks under the repaving excavation moratorium. San Francisco only.",
  vehicle: "rover",
  color: "#b8ae86",
  tools: ["http_get"],
  dataSources: ["SF Public Works Street-Use Permits (DataSF b6tj-gt35)", "Active & upcoming street surface permits (DataSF bpc9-7sus)", "Utility Excavation Moratorium Streets (DataSF 5wbp-dwzt)"],
  coverage: "San Francisco",
  builtin: true,
  async run({ task, emit, log, signal }) {
    const r = task.region;
    if (!touchesSF(r)) { log("Outside San Francisco: no Public Works permit data here."); return; }
    const now = todayIso();
    log("Checking active street-use permits and excavations…");
    const [types, surface, mora] = await Promise.all([
      soda<{ t?: string; n: string }[]>(SU, { $select: "permit_type as t, count(*) as n", $where: `${within("the_geom", r)} AND permit_start_date <= '${now}' AND permit_end_date >= '${now}' AND status not in (${DEAD})`, $group: "t", $order: "n DESC", $limit: "30" }, signal),
      soda<Surface[]>(SURFACE, { $where: `${within("point", r)} AND permit_end_date >= '${now}'`, $order: "permit_start_date DESC", $limit: "300" }, signal),
      soda<{ id: string; streetname?: string; limits?: string; expirationdate?: string; effectivedate?: string; point?: { type: "Point"; coordinates: [number, number] } }[]>(MORATORIUM, { $where: `${within("point", r)} AND expirationdate >= '${now}'`, $order: "expirationdate DESC", $limit: "40" }, signal).catch(() => []),
    ]);
    const total = types.reduce((s, t) => s + num(t.n), 0);
    const surfaceActive = surface.filter((s) => (s.permit_start_date ?? "") <= now);
    const upcoming = surface.length - surfaceActive.length;
    log(`${total} active street-use permits, ${surface.length} active/upcoming surface permits, ${mora.length} moratorium blocks`);
    const n = (k: string) => num(types.find((t) => t.t === k)?.n);
    const digs = n("Excavation") + n("ExcStreet") + n("Boring") + n("Emergency");
    const dining = n("Parklet") + n("TableChair");
    if (total || surface.length) {
      const who = new Map<string, number>();
      for (const s of surface) if (s.dba_name) who.set(s.dba_name, (who.get(s.dba_name) ?? 0) + 1);
      const topWho = [...who.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
      emit({
        claim: `${fmt(total)} street-use permits active now: ${types.slice(0, 5).map((t) => `${LABEL[t.t ?? ""] ?? t.t} (${t.n})`).join(", ")}. ${surfaceActive.length} excavations under way, ${upcoming} starting soon${topWho.length ? `; most by ${topWho.map(([w, c]) => `${w} (${c})`).join(", ")}` : ""}`,
        geometry: pt(...r.center), source_url: datasetUrl(SU), source_type: "street_use_aggregate", observed_at: day(now),
        confidence: 0.85, category: "street_work", severity: clamp01(0.2 + digs / 120),
        props: { areaLevel: true, active: total, excavations: digs, sidewalkDining: dining, parklets: n("Parklet"), surfaceActive: surfaceActive.length, surfaceUpcoming: upcoming, byType: Object.fromEntries(types.map((t) => [LABEL[t.t ?? ""] ?? t.t ?? "Other", num(t.n)])), topContractors: Object.fromEntries(topWho) },
      });
    }

    // Pins: one per block (street + cross street), newest first, active before upcoming.
    const seen = new Set<string>();
    const ordered = [...surfaceActive, ...surface.filter((s) => (s.permit_start_date ?? "") > now)];
    for (const s of ordered) {
      if (!num(s.latitude) || seen.size >= 18) continue;
      const key = `${s.street_name}|${s.cross_street}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const live = (s.permit_start_date ?? "") <= now;
      emit({
        claim: `${live ? "Digging now" : `Starts ${month(s.permit_start_date)}`}: ${LABEL[s.permit_type ?? ""] ?? s.permit_type ?? "Street work"} on ${title(s.street_name)}${s.cross_street ? ` at ${title(s.cross_street)}` : ""}${s.dba_name ? ` by ${s.dba_name}` : ""}, until ${day(s.permit_end_date)}`,
        geometry: pt(s.longitude!, s.latitude!), source_url: recordUrl(SURFACE, "permit_number", s.permit_number), source_type: "street_surface_permit",
        observed_at: day(s.permit_start_date), confidence: 0.85, category: "street_work", severity: live ? 0.5 : 0.35,
        props: { permit: s.permit_number, type: s.permit_type, contractor: s.dba_name, start: day(s.permit_start_date), end: day(s.permit_end_date), active: live, description: s.permit_description },
      });
    }
    let m = 0;
    for (const x of mora) {
      if (!x.point || m >= 8) continue;
      m++;
      emit({
        claim: `Freshly repaved: ${title(x.streetname)}${x.limits ? ` (${title(x.limits)})` : ""} is under an excavation moratorium until ${day(x.expirationdate)}`,
        geometry: x.point, source_url: datasetUrl(MORATORIUM), source_type: "excavation_moratorium", observed_at: day(x.effectivedate),
        confidence: 0.85, category: "street_work", severity: 0.25, props: { moratorium: true, street: x.streetname, limits: x.limits, until: day(x.expirationdate) },
      });
    }
  },
};
