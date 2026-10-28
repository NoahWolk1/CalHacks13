import type { Worker } from "@/lib/types";
import { locateImage } from "@/lib/locate";

// Photo Locator: runs only when the user attaches a photo to the question. Claude reads the photo's
// clues and places it (street level from the area's OSM names when the area is small enough; see
// locate.ts); each guess becomes a finding, and the orchestrator adds what the photo shows to the
// question before planning, so every other agent researches the place in the photo.
// Places only: people are never identified, and photos with people or of a home interior stay at city level.
export const PHOTO_AGENT = "photo-locator";
const CONFIDENCE = { high: 0.85, medium: 0.6, low: 0.35 } as const;
/** Areas up to this size (degrees across) get the street-level gazetteer match. */
const AREA_MAX_DEG = 0.5;

export const photoWorker: Worker = {
  id: PHOTO_AGENT,
  name: "Photo Locator",
  description: "Reads a photo attached to the question (signs, landmarks, architecture, terrain) and places it on the map, at street level inside the selected area when it can. Runs only when a photo is attached.",
  vehicle: "drone",
  color: "#f2c14e",
  tools: ["llm", "osm", "geocode"],
  dataSources: ["The attached photo (Claude vision)", "OpenStreetMap names via OpenFreeMap tiles", "Nominatim"],
  coverage: "Global",
  builtin: true,
  async run({ task, emit, log, signal }) {
    if (!task.photo) { log("No photo attached."); return; }
    const [a, b, c, d] = task.region.bbox;
    const small = c - a <= AREA_MAX_DEG && d - b <= AREA_MAX_DEG;
    log(small ? "Reading the photo and matching it against the area's street and place names…" : "Reading the photo…");
    const r = await locateImage(task.photo.data, task.photo.mediaType, signal, small ? { bbox: task.region.bbox, center: task.region.center } : undefined);
    log(`Photo: ${r.summary}`);
    if (r.capped) log(r.capped === "people" ? "People are in the photo: placed at city level only." : "Taken inside a home: placed at city level only.");
    r.guesses.forEach((g, i) => {
      const [x, y] = g.center;
      const inside = x >= a && x <= c && y >= b && y <= d;
      emit({
        claim: `${i === 0 ? "Photo most likely taken" : "Photo possibly taken"} at ${g.name}${g.detail && g.detail !== g.name ? ` (${g.detail})` : ""}: ${g.clues}`,
        geometry: { type: "Point", coordinates: [x, y] },
        source_type: g.via === "map" ? "photo + OpenStreetMap" : "photo + geocoder",
        confidence: CONFIDENCE[g.confidence],
        category: "photo",
        severity: i === 0 ? 0.9 : 0.5,
        props: { place: g.name, ...(i === 0 ? { summary: r.summary } : {}), precision: g.precision, clues: g.clues, placed: g.via === "map" ? "matched to the area's map names" : "geocoded", ...(inside ? {} : { offRegion: true }) },
      });
    });
    if (!r.guesses.length) log("No usable location clues in the photo.");
  },
};
