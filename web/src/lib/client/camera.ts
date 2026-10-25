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

/** Below `lg` the side panels are replaced by a bottom sheet; it reports its settled height here
 *  (peek or half; null while it covers the map) so a framed region re-fits above it. */
let sheetInset = 150;
let sheetCovers = false;
export function setSheetInset(px: number | null) {
  if (px === null) { sheetCovers = true; return; }
  const changed = px !== sheetInset || sheetCovers;
  sheetInset = px; sheetCovers = false;
  if (changed) reframeSoon();
}

// ── region framing ──────────────────────────────────────────────────────────
// Every path that sets a region (drawing, demo spot, shared `/?run=` link, mission history, replay)
// ends in frameRegion(). While the camera still shows that auto-framed region, anything that changes
// the visible map area (desktop panels, the mobile sheet rising when a replay finishes, a resized
// viewport, the run ending after cinematic rotation) re-fits it. A user gesture or a fly-to
// (finding, place search) hands the camera to the user and stops the re-fits.
let framed: [number, number, number, number] | null = null;
let reframeTimer: ReturnType<typeof setTimeout> | undefined;

export function frameRegion(bbox: [number, number, number, number], duration = 1400) {
  if (!map) return;
  framed = bbox;
  fit(bbox, 16.5, duration, 55);
}
/** The camera now belongs to the user (gesture, fly-to): stop re-framing on layout changes. */
export function releaseFrame() { framed = null; clearTimeout(reframeTimer); }
/** Re-fit the framed region to the current visible area once layout settles. */
export function reframeSoon(delay = 250) {
  clearTimeout(reframeTimer);
  reframeTimer = setTimeout(() => {
    if (!map || !framed || sheetCovers) return;
    fit(framed, 16.5, 700, map.getPitch());
  }, delay);
}

/** Panel-clearing padding, scaled down on small screens so the map can still fit. */
export function panelPadding() {
  const el = map?.getContainer();
  const w = el?.clientWidth ?? 1600, h = el?.clientHeight ?? 940;
  if (w < 1024) {
    // Mobile/tablet: top bar above, bottom sheet (peek) below, slim gutters on the sides.
    // The half-open sheet can cover half the screen; the cap still leaves the region ~25% of the height.
    const top = Math.min(96, h * 0.14), bottom = Math.min(sheetInset + 24, h * 0.6);
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
  releaseFrame();
  map?.flyTo({ center, zoom, pitch: 52, duration: 1600, essential: true, offset: panelOffset() });
}

/** Fit an arbitrary box (place search, an insight's findings). Not a region frame: releases it. */
export function fitBox(bbox: [number, number, number, number], maxZoom = 16.5) {
  if (!map) return;
  releaseFrame();
  const [a, b, c, d] = bbox;
  if (Math.abs(c - a) < 1e-5 && Math.abs(d - b) < 1e-5) return flyTo([a, b], Math.max(map.getZoom(), 16));
  fit(bbox, maxZoom, 1300, 52);
}

function fit([a, b, c, d]: [number, number, number, number], maxZoom: number, duration: number, pitch: number) {
  if (!map) return;
  map.fitBounds([[a, b], [c, d]], { padding: panelPadding(), pitch, bearing: map.getBearing(), duration, maxZoom });
}
