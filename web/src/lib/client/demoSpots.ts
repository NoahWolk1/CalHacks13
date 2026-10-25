import { regionFromBox } from "@/lib/geo";
import type { Region } from "@/lib/types";

export interface DemoSpot { id: string; label: string; short: string; blurb: string; box: [number, number, number, number] }

export const DEMO_SPOTS: DemoSpot[] = [
  { id: "mission-bay", label: "Mission Bay waterfront, San Francisco", short: "Mission Bay", blurb: "Flood zones + big permits", box: [-122.3985, 37.758, -122.382, 37.775] },
  { id: "embarcadero", label: "Embarcadero / Ferry Building, San Francisco", short: "Embarcadero", blurb: "Seawall + dense downtown", box: [-122.4, 37.788, -122.388, 37.8] },
  { id: "treasure-island", label: "Treasure Island, San Francisco", short: "Treasure Island", blurb: "Fill, liquefaction, redevelopment", box: [-122.38, 37.815, -122.36, 37.833] },
  { id: "mission", label: "Mission District, San Francisco", short: "Mission", blurb: "Buried creek + storm flooding", box: [-122.425, 37.755, -122.405, 37.77] },
  { id: "dogpatch", label: "Dogpatch / Pier 70, San Francisco", short: "Dogpatch", blurb: "Industrial waterfront rebuild", box: [-122.392, 37.755, -122.38, 37.766] },
];

export function regionForSpot(s: DemoSpot): Region {
  return { ...regionFromBox([s.box[0], s.box[1]], [s.box[2], s.box[3]]), label: s.label };
}
