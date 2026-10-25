import type { Worker } from "@/lib/types";
import { getJson } from "@/lib/http";

// Census tract lookup (no key) + ACS 5-year stats (needs a free CENSUS_API_KEY).
export const demographicsWorker: Worker = {
  id: "census-demographics",
  name: "Census Rover",
  description: "Looks up the census tract and its population, median household income, median rent and renter share (ACS 5-year).",
  vehicle: "rover",
  color: "#d4d0c4",
  tools: ["http_get"],
  dataSources: ["US Census Geocoder", "American Community Survey 5-yr"],
  coverage: "US",
  builtin: true,
  async run({ task, emit, log, signal }) {
    const [lng, lat] = task.region.center;
    log("Resolving census tract…");
    const geo = await getJson<{ result: { geographies: { "Census Tracts"?: { STATE: string; COUNTY: string; TRACT: string; NAME: string; GEOID: string }[] } } }>(
      `https://geocoding.geo.census.gov/geocoder/geographies/coordinates?x=${lng}&y=${lat}&benchmark=Public_AR_Current&vintage=Current_Current&layers=Census%20Tracts&format=json`,
      { signal },
    );
    const t = geo.result.geographies["Census Tracts"]?.[0];
    if (!t) { log("No US census tract here."); return; }
    const key = process.env.CENSUS_API_KEY;
    if (!key) {
      log(`${t.NAME}. Set CENSUS_API_KEY for income/rent stats.`);
      return;
    }
    const rows = await getJson<string[][]>(
      `https://api.census.gov/data/2023/acs/acs5?get=B01003_001E,B19013_001E,B25064_001E,B25003_001E,B25003_003E&for=tract:${t.TRACT}&in=state:${t.STATE}%20county:${t.COUNTY}&key=${key}`,
      { signal },
    );
    const [pop, income, rent, occ, renters] = rows[1].map(Number);
    emit({
      claim: `${t.NAME}: pop. ${pop.toLocaleString()}, median household income $${income.toLocaleString()}, median rent $${rent.toLocaleString()}/mo, ${Math.round((renters / occ) * 100)}% renters`,
      geometry: { type: "Point", coordinates: task.region.center },
      source_url: `https://data.census.gov/profile?g=1400000US${t.GEOID}`, source_type: "acs_5yr", observed_at: "2023", confidence: 0.9,
      category: "demographics", severity: 0.3, props: { areaLevel: true, pop, income, rent, renterShare: renters / occ, tract: t.GEOID },
    });
  },
};
