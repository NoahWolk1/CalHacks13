import type { Worker } from "@/lib/types";
import { distanceM, inRegion } from "@/lib/geo";
import { runActor } from "@/lib/sponsors/apify";
import { missingEnv, needsLog } from "@/lib/sponsors/keys";

// Upcoming SF Planning hearings and project notices (conditional use, variances, demolitions,
// neighborhood notifications) near the area, from our own Apify Actor (web/apify/actors/sf-planning-notices),
// which scrapes sfplanning.org's public notices table and geocodes it with DataSF's address registry.
// APIFY_PLANNING_ACTOR = "<your-apify-username>/sf-planning-notices" once pushed.

export interface PlanningNotice {
  address: string; recordNumber?: string | null; recordType?: string | null; noticeType?: string | null;
  noticeUrl?: string | null; plansUrl?: string | null; neighborhood?: string | null;
  postedDate?: string | null; expirationDate?: string | null; hearingDate?: string | null;
  lat?: number | null; lng?: number | null; distanceKm?: number; sourceUrl?: string;
}

const TYPES: Record<string, string> = { CUA: "conditional use", VAR: "variance", DRP: "discretionary review", PRJ: "project", ENV: "environmental review", CND: "condo conversion", DNX: "downtown exception", OFA: "office allocation", SHD: "shadow study" };

export const planningNoticesWorker: Worker = {
  id: "apify-planning-notices",
  name: "Hearing Watch",
  description: "Upcoming SF Planning Commission / variance hearings and project notices (conditional use, variances, demolitions, new units) near the area, with notice and plan PDFs. Custom Apify Actor scraping sfplanning.org.",
  vehicle: "car",
  color: "#f0d48a",
  tools: ["scrape"],
  dataSources: ["sfplanning.org public notices (custom Apify Actor)", "DataSF Enterprise Addressing System"],
  coverage: "San Francisco",
  builtin: true,
  async run({ task, emit, log, signal }) {
    const missing = missingEnv(planningNoticesWorker);
    if (missing.length) { log(needsLog(missing)); return; }
    const { region } = task;
    const [a, b, c, d] = region.bbox;
    // Search a little wider than the selection: a hearing two blocks away still matters.
    const radiusKm = Math.min(3, Math.max(0.6, distanceM([a, b], [c, d]) / 2000 + 0.3));
    const actor = process.env.APIFY_PLANNING_ACTOR!.trim();
    log(`Apify ${actor}: sfplanning.org notices within ${radiusKm.toFixed(1)} km…`);
    const rows = await runActor<PlanningNotice>(actor, { center: region.center, radiusKm, geocode: true, maxItems: 30 }, { signal, timeoutSec: 25, memoryMb: 256 });
    log(`${rows.length} notices near the area`);
    if (!rows.length) {
      emit({
        claim: `No active SF Planning notices or hearings within ${radiusKm.toFixed(1)} km.`,
        geometry: { type: "Point", coordinates: region.center }, source_url: "https://sfplanning.org/page/public-notices-project-applications",
        source_type: "sf_planning_notice", confidence: 0.6, category: "planning", severity: 0.2, props: { areaLevel: true },
      });
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    for (const r of rows) {
      if (r.lng == null || r.lat == null) continue;
      const kind = r.recordType ? TYPES[r.recordType] ?? r.recordType : "";
      const upcoming = !!r.hearingDate && r.hearingDate >= today;
      emit({
        claim: `${r.address}: ${r.noticeType ?? "Planning notice"}${kind ? ` (${kind})` : ""}${r.hearingDate ? `, hearing ${r.hearingDate}` : ""}${r.recordNumber ? ` · ${r.recordNumber}` : ""}`,
        geometry: { type: "Point", coordinates: [r.lng, r.lat] },
        source_url: r.noticeUrl ?? r.sourceUrl, source_type: "sf_planning_notice", observed_at: r.postedDate ?? undefined,
        confidence: 0.9, category: "planning",
        severity: (upcoming ? 0.5 : 0.3) + (inRegion(region, r.lng, r.lat) ? 0.15 : 0) + (/CUA|DRP|VAR/.test(r.recordType ?? "") ? 0.1 : 0),
        props: { ...r, upcoming, plans: r.plansUrl },
      });
    }
  },
};
