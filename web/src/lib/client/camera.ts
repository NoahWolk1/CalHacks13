"use client";
// Tiny imperative camera API so non-map components (search, demo spots) can move the map
// without routing through the store. MapView registers its map instance here.
import type { Map as MLMap } from "maplibre-gl";

let map: MLMap | null = null;
export const PANEL_PADDING = { top: 140, bottom: 120, left: 420, right: 440 };

export function registerMap(m: MLMap | null) { map = m; }

/** Below `lg` the side panels are replaced by a bottom sheet; it reports its collapsed height here. */
let sheetInset = 150;
export function setSheetInset(px: number) { sheetInset = px; }

/** Panel-clearing padding, scaled down on small screens so the map can still fit. */
export function panelPadding() {
  const el = map?.getContainer();
  const w = el?.clientWidth ?? 1600, h = el?.clientHeight ?? 940;
  if (w < 1024) {
    // Mobile/tablet: top bar above, bottom sheet (peek) below, slim gutters on the sides.
    const top = Math.min(96, h * 0.14), bottom = Math.min(sheetInset + 24, h * 0.45);
    return { top, bottom, left: 28, right: w < 640 ? 56 : 72 };
  }
  const sx = Math.min(1, (w * 0.7) / (PANEL_PADDING.left + PANEL_PADDING.right));
  const sy = Math.min(1, (h * 0.6) / (PANEL_PADDING.top + PANEL_PADDING.bottom));
  return { top: PANEL_PADDING.top * sy, bottom: PANEL_PADDING.bottom * sy, left: PANEL_PADDING.left * sx, right: PANEL_PADDING.right * sx };
}

/** Screen offset that centers a point in the panel-free area. (Passing `padding` to easeTo/flyTo
 *  would persist on the transform and stack with later fitBounds padding.) */
export function panelOffset(): [number, number] {
  const p = panelPadding();
  return [(p.left - p.right) / 2, (p.top - p.bottom) / 2];
}

export function flyTo(center: [number, number], zoom = 15) {
  map?.flyTo({ center, zoom, pitch: 52, duration: 1600, essential: true, offset: panelOffset() });
}

export function fitBox(bbox: [number, number, number, number], maxZoom = 16.5) {
  if (!map) return;
  const [a, b, c, d] = bbox;
  if (Math.abs(c - a) < 1e-5 && Math.abs(d - b) < 1e-5) return flyTo([a, b], Math.max(map.getZoom(), 16));
  map.fitBounds([[a, b], [c, d]], { padding: panelPadding(), pitch: 52, bearing: map.getBearing(), duration: 1300, maxZoom });
}
