import type { Map as MLMap } from "maplibre-gl";

export const STYLE_URL = "https://tiles.openfreemap.org/styles/dark";

// Re-tint OpenFreeMap's dark style into a deep-navy "ops console" look + 3D buildings.
export function applyTheme(map: MLMap) {
  const paint: [string, string, unknown][] = [
    ["background", "background-color", "#060a11"],
    ["water", "fill-color", "#0a1626"],
    ["waterway", "line-color", "#0a1626"],
    ["landuse_residential", "fill-color", "#0a0f18"],
    ["landuse_park", "fill-color", "#0b1714"],
    ["highway_minor", "line-color", "#121c2b"],
    ["highway_major_casing", "line-color", "rgba(64,98,140,0.35)"],
    ["highway_major_inner", "line-color", "#0f1726"],
    ["highway_motorway_inner", "line-color", "#1b2f4a"],
    ["highway_name_other", "text-color", "#3f4d61"],
    ["place_suburb", "text-color", "#5d6f88"],
    ["place_city", "text-color", "#7d8ea6"],
  ];
  for (const [id, prop, val] of paint) if (map.getLayer(id)) map.setPaintProperty(id, prop as never, val as never);
  if (map.getLayer("building")) map.setLayoutProperty("building", "visibility", "none");
  if (!map.getLayer("building-3d")) {
    map.addLayer({
      id: "building-3d",
      type: "fill-extrusion",
      source: "openmaptiles",
      "source-layer": "building",
      minzoom: 13,
      paint: {
        "fill-extrusion-color": ["interpolate", ["linear"], ["coalesce", ["get", "render_height"], 8], 0, "#0d1522", 40, "#132034", 120, "#1b2d48"],
        "fill-extrusion-height": ["coalesce", ["get", "render_height"], 8],
        "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
        "fill-extrusion-opacity": 0.85,
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
