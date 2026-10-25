import type { Worker } from "@/lib/types";
import type { Point } from "geojson";
import { inRegion } from "@/lib/geo";
import { arcgisQuery, bboxIntersects, osmTileLayers, padBbox } from "./kit";

// Schools & childcare.
// - California public schools (CDE "School Sites 2025-26", public ArcGIS layer): level, grades, enrollment,
//   charter status, % socioeconomically disadvantaged / English learners.
// - Private schools, preschools and childcare from OpenStreetMap (OpenFreeMap tiles), global.
const CDE = "https://services3.arcgis.com/fdvHcZVgB2QSRNkL/arcgis/rest/services/SchoolSites2526/FeatureServer/0";
const CA: [number, number, number, number] = [-124.5, 32.5, -114.1, 42.1];
const NEAR_M = 400;
const OSM_KINDS = new Set(["school", "kindergarten", "childcare", "college", "university"]);

const norm = (s: string) => s.toLowerCase().replace(/\b(elementary|middle|high|school|academy|the|of|and|sf|san francisco)\b|[^a-z0-9]/g, "");

export const schoolsWorker: Worker = {
  id: "ca-schools",
  name: "School Run",
  description: "Lists schools and childcare in and right around the area: California public schools with grades, enrollment, charter status and student need (CDE), plus private schools, preschools and daycares from OpenStreetMap.",
  vehicle: "car",
  color: "#b0e0d0",
  tools: ["http_get"],
  dataSources: ["California Department of Education School Sites 2025-26", "OpenStreetMap via OpenFreeMap"],
  coverage: "California public schools; global (OSM schools & childcare)",
  builtin: true,
  async run({ task, emit, log, signal }) {
    const r = task.region;
    const inCA = bboxIntersects(r.bbox, CA);
    log(inCA ? "Querying CDE public school sites + OSM schools/childcare…" : "Reading OSM schools/childcare…");
    const [cde, osm] = await Promise.all([
      inCA
        ? arcgisQuery<Point>(CDE, padBbox(r.bbox, NEAR_M), {
            where: "Status = 'Active'", signal,
            outFields: "SchoolName,DistrictName,SchoolLevel,SchoolType,GradeLow,GradeHigh,Charter,EnrollTotal,SEDpct,ELpct,TitleIStatus,Street,Website,CDSCode,Virtual",
          }).catch((e) => { log(`CDE: ${(e as Error).message}`); return []; })
        : Promise.resolve([]),
      osmTileLayers(r, ["poi"], signal).then((o) => o.poi).catch(() => []),
    ]);
    const pub = cde.filter((f) => f.geometry && f.properties?.Virtual !== "Y" && f.properties?.Virtual !== "C");
    const inside = pub.filter((f) => inRegion(r, f.geometry.coordinates[0], f.geometry.coordinates[1]));
    const nearby = pub.length - inside.length;
    const pubNames = new Set(pub.map((f) => norm(String(f.properties?.SchoolName ?? ""))));

    const seen = new Set<string>();
    const other: { name: string; kind: string; p: [number, number] }[] = [];
    for (const f of osm) {
      const sub = String(f.properties?.subclass ?? ""), cls = String(f.properties?.class ?? "");
      const name = String(f.properties?.name ?? "");
      if (!name || f.geometry.type !== "Point" || !(OSM_KINDS.has(sub) || (cls === "school" && OSM_KINDS.has(sub || cls)))) continue;
      const p = f.geometry.coordinates as [number, number];
      if (!inRegion(r, p[0], p[1]) || seen.has(name)) continue;
      seen.add(name);
      if (pubNames.has(norm(name))) continue; // already covered by CDE
      other.push({ name, kind: sub || cls, p });
    }
    log(`${inside.length} public schools inside (+${nearby} within ${NEAR_M} m), ${other.length} other schools/childcare from OSM`);

    const enroll = inside.reduce((s, f) => s + (Number(f.properties?.EnrollTotal) || 0), 0);
    const levels: Record<string, number> = {};
    for (const f of inside) { const l = String(f.properties?.SchoolLevel ?? "Other"); levels[l] = (levels[l] ?? 0) + 1; }
    const childcare = other.filter((o) => /kindergarten|childcare/.test(o.kind)).length;
    const highNeed = inside.filter((f) => Number(f.properties?.SEDpct) >= 70).length;
    emit({
      claim: `${inside.length} public school${inside.length === 1 ? "" : "s"} in the area${inside.length ? ` (${Object.entries(levels).map(([k, n]) => `${n} ${k.toLowerCase()}`).join(", ")}; ${enroll.toLocaleString()} students${highNeed ? `; ${highNeed} where 70%+ of students are low-income` : ""})` : ""}${nearby ? `, ${nearby} more within ${NEAR_M} m` : ""}; plus ${other.length - childcare} private/other schools and ${childcare} preschools/childcare centers in OpenStreetMap`,
      geometry: { type: "Point", coordinates: r.center },
      source_url: "https://www.cde.ca.gov/ds/si/ds/pubschls.asp", source_type: "cde_schools", confidence: 0.85, category: "school",
      severity: +Math.min(0.7, 0.15 + (inside.length + childcare) / 25).toFixed(2),
      props: { areaLevel: true, publicInside: inside.length, publicNearby: nearby, enrollment: enroll, levels, osmOther: other.length - childcare, childcare, highNeedSchools: highNeed },
    });

    const enr = (f: (typeof pub)[number]) => (inside.includes(f) ? 1e6 : 0) + (Number(f.properties?.EnrollTotal) || 0);
    for (const f of [...pub].sort((a, b) => enr(b) - enr(a)).slice(0, 15)) {
      const q = f.properties ?? {};
      const p = f.geometry.coordinates as [number, number];
      const isIn = inRegion(r, p[0], p[1]);
      emit({
        claim: `${q.SchoolName} (${q.Charter === "Y" ? "charter " : ""}${String(q.SchoolLevel ?? q.SchoolType ?? "school").toLowerCase()}, grades ${q.GradeLow}–${q.GradeHigh}, ${q.EnrollTotal ?? "?"} students${q.SEDpct != null ? `, ${Math.round(Number(q.SEDpct))}% low-income` : ""}${Number(q.ELpct) >= 25 ? `, ${Math.round(Number(q.ELpct))}% English learners` : ""})${isIn ? "" : `, just outside the area`}`,
        geometry: { type: "Point", coordinates: p },
        source_url: q.Website ? String(q.Website) : `https://www.cde.ca.gov/SchoolDirectory/details?cdscode=${q.CDSCode}`,
        source_type: "cde_schools", confidence: 0.9, category: "school", severity: +(isIn ? 0.45 : 0.25).toFixed(2),
        props: { name: q.SchoolName, district: q.DistrictName, level: q.SchoolLevel, grades: `${q.GradeLow}-${q.GradeHigh}`, enrollment: q.EnrollTotal, charter: q.Charter === "Y", lowIncomePct: q.SEDpct, englishLearnerPct: q.ELpct, titleI: q.TitleIStatus === "Y", address: q.Street, cdsCode: q.CDSCode, sensitiveSite: true, offRegion: !isIn },
      });
    }
    for (const o of other.slice(0, 10)) {
      emit({
        claim: `${o.name} (${o.kind.replace(/_/g, " ")}, OpenStreetMap)`,
        geometry: { type: "Point", coordinates: o.p },
        source_url: `https://www.openstreetmap.org/search?query=${encodeURIComponent(o.name)}#map=19/${o.p[1]}/${o.p[0]}`,
        source_type: "osm_poi", confidence: 0.65, category: "school", severity: 0.3,
        props: { name: o.name, kind: o.kind, childcare: /kindergarten|childcare/.test(o.kind), sensitiveSite: true },
      });
    }
  },
};
