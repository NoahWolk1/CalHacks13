"use client";
// Tiny imperative camera API so non-map components (search, demo spots) can move the map
// without routing through the store. MapView registers its map instance here.
import type { Map as MLMap } from "maplibre-gl";
import { geometry } from "./layout";

let map: MLMap | null = null;
/** Breathing room between a fitted region and the panels / top bar / status bar. */
const FIT_GUTTER = 36;
/** Docked 48px top bar + mission bar above, status strip below. */
const PAD_Y = { top: 120, bottom: 90 };

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
  // Desktop: the panels float over a full-screen map, so pad by the live panel geometry.
  const g = geometry();
  let left = g.le + FIT_GUTTER, right = g.re + FIT_GUTTER;
  const minFit = 240; // never leave less than this much width for the region itself
  if (w - left - right < minFit) {
    const k = Math.max(0, (w - minFit) / (left + right));
    left *= k; right *= k;
  }
  const sy = Math.min(1, (h * 0.6) / (PAD_Y.top + PAD_Y.bottom));
  return { top: PAD_Y.top * sy, bottom: PAD_Y.bottom * sy, left, right };
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
