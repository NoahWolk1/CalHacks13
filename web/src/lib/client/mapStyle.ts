import type { Map as MLMap } from "maplibre-gl";
import { BASEMAP, BASEMAP_HALO, BUILDING_RAMP, MAP_LIGHT } from "./theme";

export const STYLE_URL = "https://tiles.openfreemap.org/styles/dark";

// Re-tint OpenFreeMap's dark style into a neutral graphite "night survey" sheet + quiet 3D buildings.
export function applyTheme(map: MLMap) {
  for (const [id, prop, val] of BASEMAP) if (map.getLayer(id)) map.setPaintProperty(id, prop as never, val as never);
  for (const id of ["highway_name_other", "highway_name_motorway", "water_name", "place_other", "place_suburb", "place_city"]) {
    if (map.getLayer(id)) map.setPaintProperty(id, "text-halo-color" as never, BASEMAP_HALO as never);
  }
  map.setLight({ ...MAP_LIGHT, position: [...MAP_LIGHT.position] });
  if (map.getLayer("building")) map.setLayoutProperty("building", "visibility", "none");
  if (!map.getLayer("building-3d")) {
    const [c0, h1, c1, h2, c2] = BUILDING_RAMP;
    map.addLayer({
      id: "building-3d",
      type: "fill-extrusion",
      source: "openmaptiles",
      "source-layer": "building",
      minzoom: 13,
      paint: {
        "fill-extrusion-color": ["interpolate", ["linear"], ["coalesce", ["get", "render_height"], 8], 0, c0, h1, c1, h2, c2],
        "fill-extrusion-height": ["coalesce", ["get", "render_height"], 8],
        "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
        "fill-extrusion-opacity": 0.92,
        "fill-extrusion-vertical-gradient": false,
      },
    }, "highway_name_other");
  }
}

/** Street centerlines currently loaded in the viewport, for cars to drive on. */
export function extractRoads(map: MLMap): [number, number][][] {
  const feats = map.querySourceFeatures("openmaptiles", {
    sourceLayer: "transportation",
    filter: ["in", ["get", "class"], ["literal", ["primary", "secondary", "tertiary", "minor", "service", "trunk"]]],
  });
  const lines: [number, number][][] = [];
  for (const f of feats) {
    const g = f.geometry;
    if (g.type === "LineString") lines.push(g.coordinates as [number, number][]);
    else if (g.type === "MultiLineString") lines.push(...(g.coordinates as [number, number][][]));
  }
  return lines;
}
