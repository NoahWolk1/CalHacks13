"use client";

// Interactive sky atlas: Aladin Lite v3 (CDS Strasbourg), loaded as an ES module from jsdelivr at a
// pinned version (no npm dependency). Draws the selected cone and the sky agents' results, and on a
// canvas above it the agents themselves at work inside the cone (lib/client/skyFleet.ts).
import { useEffect, useRef, useState } from "react";
import { SkyFleet, type P, type SkyActivity } from "@/lib/client/skyFleet";
import { separation } from "@/lib/sky/geom";
import type { Cone, SkyCategory, SkyObject } from "@/lib/sky/types";

export const ALADIN_URL = "https://cdn.jsdelivr.net/npm/aladin-lite@3.8.2/dist/aladin.js";

export const SURVEYS = [
  { id: "P/DSS2/color", label: "DSS color" },
  { id: "P/PanSTARRS/DR1/color-z-zg-g", label: "PanSTARRS" },
] as const;

export const CATEGORY_STYLE: Record<SkyCategory, { color: string; label: string; shape: string }> = {
  galaxy: { color: "#8fb3ff", label: "Galaxies", shape: "circle" },
  nebula: { color: "#e58fb5", label: "Nebulae", shape: "rhomb" },
  cluster: { color: "#d2c162", label: "Clusters", shape: "square" },
  star: { color: "#ecebe6", label: "Stars", shape: "plus" },
  exoplanet: { color: "#6dbf8b", label: "Exoplanets", shape: "triangle" },
  "solar-system": { color: "#e8853d", label: "Sun, Moon & planets", shape: "circle" },
  observation: { color: "#5ec8d8", label: "Telescope archives", shape: "square" },
  candidate: { color: "#f2c35b", label: "Transit signals", shape: "triangle" },
  variable: { color: "#b39dff", label: "Variable stars", shape: "circle" },
  other: { color: "#b3afa6", label: "Other", shape: "cross" },
};

/* eslint-disable @typescript-eslint/no-explicit-any -- Aladin Lite ships no types */
type AladinLib = any;
type Aladin = any;

let loading: Promise<AladinLib> | null = null;
function loadAladin(): Promise<AladinLib> {
  const w = window as unknown as { __aladinLib?: AladinLib };
  if (w.__aladinLib) return Promise.resolve(w.__aladinLib);
  return (loading ??= new Promise((resolve, reject) => {
    const done = () => { window.removeEventListener("aladin-ready", done); if (w.__aladinLib) resolve(w.__aladinLib); else reject(new Error("Aladin Lite failed to load")); };
    window.addEventListener("aladin-ready", done);
    const s = document.createElement("script");
    s.type = "module";
    // Module script: the bundle is an ES module with a default export.
    s.textContent = `import A from "${ALADIN_URL}"; await A.init; window.__aladinLib = A; window.dispatchEvent(new Event("aladin-ready"));`;
    s.onerror = () => reject(new Error("Aladin Lite failed to load"));
    document.head.appendChild(s);
    setTimeout(() => { if (!w.__aladinLib) { loading = null; reject(new Error("Aladin Lite timed out loading")); } }, 20_000);
  }));
}

export type AtlasApi = {
  view: () => Cone | null;
  goto: (c: Cone) => void;
  drawCircle: (cb: (c: Cone) => void) => void;
  setSurvey: (id: string) => void;
};

export default function SkyAtlas({ cone, objects, selectedId, onSelect, apiRef, onError, activity }: {
  cone: Cone; objects: SkyObject[]; selectedId: string | null; onSelect: (id: string) => void;
  apiRef: React.MutableRefObject<AtlasApi | null>; onError: (msg: string) => void; activity: SkyActivity;
}) {
  const div = useRef<HTMLDivElement>(null);
  const al = useRef<{ A: AladinLib; aladin: Aladin; cone: any; results: any[]; sel: any } | null>(null);
  const [ready, setReady] = useState(false);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const initial = useRef(cone);

  useEffect(() => {
    let dead = false;
    loadAladin().then((A) => {
      if (dead || !div.current) return;
      const c0 = initial.current;
      const aladin = A.aladin(div.current, {
        survey: SURVEYS[0].id, fov: Math.max(0.2, c0.radius * 3), target: `${c0.ra} ${c0.dec}`, cooFrame: "ICRS",
        showReticle: true, showZoomControl: true, showFullscreenControl: false, showLayersControl: false, showGotoControl: false,
        showFrame: false, showCooGrid: false, showProjectionControl: false, showSettingsControl: false, showShareControl: false,
        showContextMenu: false, showSimbadPointerControl: false, showCooGridControl: false, showStatusBar: false,
        reticleColor: "#9a968d", reticleSize: 18, backgroundColor: "rgb(8,8,8)",
      });
      const coneLayer = A.graphicOverlay({ color: "#e8853d", lineWidth: 2 });
      aladin.addOverlay(coneLayer);
      const sel = A.graphicOverlay({ color: "#ffffff", lineWidth: 2 });
      aladin.addOverlay(sel);
      aladin.on("objectClicked", (o: any) => { const id = o?.data?.id; if (typeof id === "string") onSelectRef.current(id); });
      al.current = { A, aladin, cone: coneLayer, results: [], sel };
      apiRef.current = {
        view: () => {
          const [ra, dec] = aladin.getRaDec();
          const [fw, fh] = aladin.getFov();
          return Number.isFinite(ra) && Number.isFinite(dec) ? { ra, dec, radius: Math.min(fw, fh) / 2 } : null;
        },
        goto: (c) => { aladin.gotoRaDec(c.ra, c.dec); aladin.setFoV(Math.max(0.2, c.radius * 3)); },
        drawCircle: (cb) => aladin.select("circle", (shape: { x: number; y: number; r: number }) => {
          const center = aladin.pix2world(shape.x, shape.y);
          const edge = aladin.pix2world(shape.x + shape.r, shape.y);
          if (!center || !edge || shape.r < 3) return;
          cb({ ra: center[0], dec: center[1], radius: Math.max(0.01, separation(center[0], center[1], edge[0], edge[1])) });
        }),
        setSurvey: (id) => (aladin.setImageSurvey ?? aladin.setBaseImageLayer).call(aladin, id),
      };
      setReady(true);
    }).catch((e: Error) => !dead && onError(e.message));
    return () => { dead = true; apiRef.current = null; };
  }, [apiRef, onError]);

  // Selected cone outline.
  useEffect(() => {
    const a = al.current;
    if (!ready || !a) return;
    a.cone.removeAll();
    a.cone.add(a.A.circle(cone.ra, cone.dec, cone.radius, { color: "#e8853d", lineWidth: 2 }));
  }, [ready, cone]);

  // Result markers: one catalog per category, labelled.
  useEffect(() => {
    const a = al.current;
    if (!ready || !a) return;
    for (const c of a.results) { try { if (a.aladin.removeOverlay) a.aladin.removeOverlay(c); else a.aladin.removeLayer(c); } catch { c.hide?.(); } }
    a.results = [];
    const rank = new Map(objects.map((o, i) => [o.id, o.category === "solar-system" ? 0 : i]));
    const groups = new Map<SkyCategory, SkyObject[]>();
    for (const o of objects) groups.set(o.category, [...(groups.get(o.category) ?? []), o]);
    for (const [cat, list] of groups) {
      const st = CATEGORY_STYLE[cat];
      const layer = a.A.catalog({ name: st.label, color: st.color, shape: st.shape, sourceSize: cat === "solar-system" ? 20 : 13, displayLabel: cat !== "star", labelColumn: "name", labelColor: st.color, labelFont: "11px sans-serif" });
      a.aladin.addCatalog(layer);
      // Label only the most notable results (each source returns them ranked) to keep the field readable.
      layer.addSources(list.map((o) => a.A.source(o.ra, o.dec, { id: o.id, name: rank.get(o.id)! < 14 ? o.name : "" })));
      a.results.push(layer);
    }
  }, [ready, objects]);

  // Highlight ring around the selected result.
  useEffect(() => {
    const a = al.current;
    if (!ready || !a) return;
    a.sel.removeAll();
    const o = objects.find((x) => x.id === selectedId);
    if (o) a.sel.add(a.A.circle(o.ra, o.dec, Math.max(cone.radius / 25, 0.004), { color: "#ffffff", lineWidth: 2 }));
  }, [ready, selectedId, objects, cone.radius]);

  // Agent fleet: event state in, motion out (drawn every frame on the overlay canvas).
  const fleet = useRef(new SkyFleet());
  const canvas = useRef<HTMLCanvasElement>(null);
  const coneRef = useRef(cone);
  coneRef.current = cone;
  useEffect(() => { fleet.current.sync(activity, cone, performance.now() / 1000); }, [activity, cone]);
  useEffect(() => {
    if (!ready) return;
    let raf = 0, last = performance.now() / 1000;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const now = performance.now() / 1000;
      fleet.current.tick(now, now - last);
      last = now;
      const a = al.current, cv = canvas.current;
      if (a && cv) drawFleet(cv, a.aladin, coneRef.current, fleet.current, now);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [ready]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#080808]">
      {/* Aladin positions its controls against this div: it must be the positioned, sized box. */}
      <div ref={div} className="relative h-full w-full" />
      <canvas ref={canvas} aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" />
      {!ready && <div className="absolute inset-0 grid place-items-center text-[12.5px] text-fg3">Loading sky atlas…</div>}
    </div>
  );
}

// ── fleet overlay ────────────────────────────────────────────────────────────

const rgba = (c: [number, number, number], a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

/** Draws the sky agents on the overlay canvas. Disc coordinates map to screen through the cone's
 *  projected centre and its east/north vectors (from Aladin's world2pix), and everything is clipped
 *  to the cone, so agents never leave the research circle whatever the pan, zoom or projection. */
function drawFleet(cv: HTMLCanvasElement, aladin: Aladin, cone: Cone, fleet: SkyFleet, now: number) {
  const dpr = window.devicePixelRatio || 1;
  const w = cv.clientWidth, h = cv.clientHeight;
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  const ctx = cv.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  if (!fleet.probes.size && !fleet.marks.length) return;

  // Projection from short offsets (a quarter radius) so it works zoomed in, scaled back up x4.
  const k = 0.25 * cone.radius;
  const nDec = cone.dec + k <= 90 ? cone.dec + k : cone.dec - k, nSign = cone.dec + k <= 90 ? 1 : -1;
  let c0: number[] | null = null, n1: number[] | null = null, e1: number[] | null = null;
  try {
    c0 = aladin.world2pix(cone.ra, cone.dec);
    n1 = aladin.world2pix(cone.ra, nDec);
    e1 = aladin.world2pix((cone.ra + k / Math.max(0.05, Math.cos((cone.dec * Math.PI) / 180)) + 360) % 360, cone.dec);
  } catch { return; }
  if (!c0 || !n1 || !e1 || ![...c0, ...n1, ...e1].every(Number.isFinite)) return;
  const N = [((n1[0] - c0[0]) * nSign) / 0.25, ((n1[1] - c0[1]) * nSign) / 0.25];
  const E = [(e1[0] - c0[0]) / 0.25, (e1[1] - c0[1]) / 0.25];
  const px = (p: P): [number, number] => [c0![0] + p[0] * E[0] + p[1] * N[0], c0![1] + p[0] * E[1] + p[1] * N[1]];
  const unit = Math.max(1, Math.min(Math.hypot(E[0], E[1]), Math.hypot(N[0], N[1]))); // disc radius in px
  const s = Math.min(1.6, Math.max(0.6, unit / 220)); // sprite scale: smaller when the cone is small on screen

  ctx.save();
  // Clip to the cone (the disc mapped through the same affine transform as everything else).
  ctx.setTransform(dpr * E[0], dpr * E[1], dpr * N[0], dpr * N[1], dpr * c0[0], dpr * c0[1]);
  ctx.beginPath();
  ctx.arc(0, 0, 1, 0, Math.PI * 2);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clip();
  ctx.globalCompositeOperation = "lighter";

  // Command post.
  const [bx, by] = px(fleet.base);
  ctx.strokeStyle = "rgba(232,133,61,0.85)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + now * 0.3; const x = bx + Math.cos(a) * 7 * s, y = by + Math.sin(a) * 7 * s; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
  ctx.closePath();
  ctx.stroke();

  // Persistent markers: variable stars (soft) and unvetted candidates (pulsing).
  for (const m of fleet.marks) {
    const [x, y] = px(m.at);
    const ph = (now - m.since) * (m.strong ? 1.6 : 0.8);
    const r = (m.strong ? 9 : 6) * s * (1 + 0.25 * Math.sin(ph * Math.PI));
    ctx.strokeStyle = rgba(m.color, m.strong ? 0.95 : 0.55);
    ctx.lineWidth = m.strong ? 2 : 1;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
    if (m.strong) { ctx.strokeStyle = rgba(m.color, 0.35 * (1 - (ph % 1))); ctx.beginPath(); ctx.arc(x, y, r * (1.4 + (ph % 1)), 0, Math.PI * 2); ctx.stroke(); }
  }

  // Expanding rings: summons (at the command post) and strong finds.
  for (const r of fleet.rings) {
    if (now < r.t0) continue;
    const t = (now - r.t0) / r.dur;
    const [x, y] = px(r.at);
    ctx.strokeStyle = rgba(r.color, 0.9 * (1 - t));
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, Math.max(1, r.size * unit * t), 0, Math.PI * 2); ctx.stroke();
  }

  for (const p of fleet.probes.values()) {
    if (now < p.born) continue;
    const [x, y] = px(p.pos);
    const alive = p.mode !== "done" && p.mode !== "error";
    const appear = Math.min(1, (now - p.born) / 0.6);
    // Trail.
    if (p.trail.length > 1) {
      for (let i = 1; i < p.trail.length; i++) {
        const [x0, y0] = px(p.trail[i - 1]), [x1, y1] = px(p.trail[i]);
        ctx.strokeStyle = rgba(p.color, (i / p.trail.length) * (alive ? 0.4 : 0.15));
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      }
    }
    // Work: the Observer's scanline spans the cone; others sweep a short radar wedge.
    if (alive && p.mode === "working") {
      if (p.pattern === "raster") {
        const [lx, ly] = px([-1, p.pos[1]]), [rx, ry] = px([1, p.pos[1]]);
        const g = ctx.createLinearGradient(lx, ly, rx, ry);
        g.addColorStop(0, rgba(p.color, 0)); g.addColorStop(0.5, rgba(p.color, 0.45)); g.addColorStop(1, rgba(p.color, 0));
        ctx.strokeStyle = g; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(rx, ry); ctx.stroke();
      } else {
        const R = 34 * s;
        ctx.fillStyle = rgba(p.color, 0.13);
        ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, R, p.scan, p.scan + 0.6); ctx.closePath(); ctx.fill();
      }
    }
    // Beams to what the agent is looking at.
    for (const b of p.beams) {
      const [tx, ty] = px(b.to);
      const life = Math.max(0, (b.until - now) / (b.until - b.t0));
      ctx.strokeStyle = rgba(p.color, (b.strong ? 0.95 : 0.6) * life);
      ctx.lineWidth = b.strong ? 2.2 : 1.2;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(tx, ty); ctx.stroke();
      ctx.beginPath(); ctx.arc(tx, ty, (b.strong ? 5 : 3) * s, 0, Math.PI * 2); ctx.stroke();
    }
    // Body: glow, core, heading tick; a pulse after a strong find.
    const pulse = Math.max(0, 1 - (now - p.pulse) / 1.2);
    const r = (4 + pulse * 3) * s * appear;
    const glow = ctx.createRadialGradient(x, y, 0, x, y, r * 3.5);
    glow.addColorStop(0, rgba(p.color, alive ? 0.55 : 0.25)); glow.addColorStop(1, rgba(p.color, 0));
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(x, y, r * 3.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = p.mode === "error" ? "rgba(228,88,88,0.9)" : rgba(p.color, alive ? 1 : 0.55);
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    // Heading in disc space, mapped to screen.
    const [hx, hy] = px([p.pos[0] + Math.cos(p.heading) * 0.03, p.pos[1] + Math.sin(p.heading) * 0.03]);
    const hl = Math.hypot(hx - x, hy - y) || 1;
    ctx.strokeStyle = rgba(p.color, alive ? 0.9 : 0.4);
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + ((hx - x) / hl) * r * 2.6, y + ((hy - y) / hl) * r * 2.6); ctx.stroke();
  }
  ctx.restore();

  // Agent names beside the working agents (outside the clip so labels near the rim stay whole).
  ctx.font = `${Math.round(10.5 * Math.min(1.2, Math.max(0.85, s)))}px ui-sans-serif, system-ui, sans-serif`;
  // Agents working the same tight group of stars would stack their names: nudge each label down
  // until it clears the ones already placed.
  const placed: [number, number, number, number][] = [];
  const lh = 13 * Math.min(1.2, Math.max(0.85, s));
  for (const p of fleet.probes.values()) {
    if (now < p.born + 0.3 || p.mode === "done" || p.mode === "error") continue;
    const [x, y] = px(p.pos);
    const lx = x + 9 * s, lw = ctx.measureText(p.name).width;
    let ly = y - 7 * s;
    for (let i = 0; i < 8 && placed.some(([ax, ay, aw, ah]) => lx < ax + aw && ax < lx + lw && ly - lh < ay && ay - ah < ly); i++) ly += lh;
    placed.push([lx, ly, lw, lh]);
    ctx.fillStyle = rgba(p.color, 0.85);
    ctx.fillText(p.name, lx, ly);
  }
}
