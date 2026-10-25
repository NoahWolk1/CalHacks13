"use client";
// The real sky behind the globe: bright stars, constellation stick figures and the Sun, Moon and
// planets at their current positions. A 2D canvas sits behind MapLibre's (transparent-outside-the-
// globe) WebGL canvas; each frame we rebuild the camera's orientation in Earth-fixed coordinates
// from the map's center/bearing/pitch/fov and project celestial directions (rotated by Greenwich
// sidereal time) onto it. Stars are at infinity, so only the camera's orientation matters.
// Hidden (display:none, no work) from GLOBE_END up.
//
// Data: public/sky-catalog.json, built from d3-celestial (BSD-3, Olaf Frohn) stars.6 /
// constellations data (stars from the HYG database, CC BY-SA). Ephemerides: astronomy-engine (MIT).
import type { Map as MLMap } from "maplibre-gl";

type V3 = [number, number, number];
interface Catalog { stars: [number, number, number, number][]; lines: number[][]; names: [number, number, string][] }
interface Body { name: string; v: V3; kind: "sun" | "moon" | "planet"; mag: number }

/** Kill switch: NEXT_PUBLIC_SKY=0 at build time disables the starfield entirely. */
export const SKY_ENABLED = process.env.NEXT_PUBLIC_SKY !== "0";

const D = Math.PI / 180;
const FADE_FROM = 6.5; // == GLOBE_END in space.ts (kept literal to avoid an import cycle)
const FADE_FULL = 5.0;
const SKY_FOV_SCALE = 2;

const unit = (raDeg: number, decDeg: number): V3 => {
  const a = raDeg * D, d = decDeg * D;
  return [Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d)];
};
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const mul = (m: number[][], v: V3): V3 => [
  m[0][0] * v[0] + m[1][0] * v[1] + m[2][0] * v[2],
  m[0][1] * v[0] + m[1][1] * v[1] + m[2][1] * v[2],
  m[0][2] * v[0] + m[1][2] * v[1] + m[2][2] * v[2],
];

/** B-V colour index -> a soft star tint. */
function tint(bv: number): string {
  if (bv < 0) return "#b9cbff";
  if (bv < 0.3) return "#dfe6ff";
  if (bv < 0.6) return "#fbf8f0";
  if (bv < 1.0) return "#ffeccc";
  if (bv < 1.4) return "#ffd9a8";
  return "#ffc489";
}

/** Camera basis in Earth-fixed (ECEF) coordinates for a MapLibre camera. */
export function cameraBasis(lng: number, lat: number, bearing: number, pitch: number) {
  const l = lng * D, f = lat * D, b = bearing * D, p = pitch * D;
  const U: V3 = [Math.cos(f) * Math.cos(l), Math.cos(f) * Math.sin(l), Math.sin(f)];
  const E: V3 = [-Math.sin(l), Math.cos(l), 0];
  const N: V3 = [-Math.sin(f) * Math.cos(l), -Math.sin(f) * Math.sin(l), Math.cos(f)];
  const up: V3 = [0, 1, 2].map((i) => N[i] * Math.cos(b) + E[i] * Math.sin(b)) as V3;
  const right: V3 = [0, 1, 2].map((i) => E[i] * Math.cos(b) - N[i] * Math.sin(b)) as V3;
  const fwd: V3 = [0, 1, 2].map((i) => -U[i] * Math.cos(p) + up[i] * Math.sin(p)) as V3;
  const camUp: V3 = [0, 1, 2].map((i) => U[i] * Math.sin(p) + up[i] * Math.cos(p)) as V3;
  return { right, up: camUp, fwd };
}

/** Celestial (equator-of-date) unit vector -> Earth-fixed, given Greenwich apparent sidereal time (hours). */
export function toEcef(v: V3, gastHours: number): V3 {
  const g = gastHours * 15 * D, c = Math.cos(g), s = Math.sin(g);
  return [v[0] * c + v[1] * s, -v[0] * s + v[1] * c, v[2]];
}

let catalog: Promise<Catalog> | null = null;
const loadCatalog = () => (catalog ??= fetch("/sky-catalog.json").then((r) => { if (!r.ok) throw new Error("sky"); return r.json(); }).catch((e) => { catalog = null; throw e; }));

export function installSky(map: MLMap): () => void {
  const container = map.getContainer();
  const canvas = document.createElement("canvas");
  canvas.className = "coordinate-sky";
  canvas.setAttribute("aria-hidden", "true");
  Object.assign(canvas.style, { position: "absolute", inset: "0", width: "100%", height: "100%", pointerEvents: "none", display: "none" });
  container.insertBefore(canvas, container.firstChild);
  const ctx = canvas.getContext("2d")!;

  let disposed = false;
  let cat: Catalog | null = null;
  // Precomputed equator-of-date unit vectors (J2000 catalog precessed once per load).
  let stars: { v: V3; mag: number; color: string }[] = [];
  let lines: V3[][] = [];
  let names: { v: V3; text: string }[] = [];
  let bodies: Body[] = [];
  let gast = 0; // hours
  let astro: typeof import("astronomy-engine") | null = null;
  let lastEphem = 0;

  const ephemeris = () => {
    if (!astro) return;
    const A = astro;
    const now = new Date();
    lastEphem = now.getTime();
    const t = A.MakeTime(now);
    const obs = new A.Observer(0, 0, 0);
    const rot = A.Rotation_EQJ_EQD(t).rot;
    gast = A.SiderealTime(t);
    if (cat && !stars.length) {
      const P = (ra: number, dec: number) => mul(rot, unit(ra, dec));
      stars = cat.stars.map(([ra, dec, mag, bv]) => ({ v: P(ra, dec), mag, color: tint(bv) }));
      lines = cat.lines.map((l) => { const out: V3[] = []; for (let i = 0; i < l.length; i += 2) out.push(P(l[i], l[i + 1])); return out; });
      names = cat.names.map(([ra, dec, text]) => ({ v: P(ra, dec), text: text.toUpperCase() }));
    }
    const want: [string, Body["kind"]][] = [["Sun", "sun"], ["Moon", "moon"], ["Mercury", "planet"], ["Venus", "planet"], ["Mars", "planet"], ["Jupiter", "planet"], ["Saturn", "planet"]];
    bodies = want.map(([name, kind]) => {
      const eq = A.Equator(name as never, t, obs, true, true);
      let mag = kind === "sun" ? -26 : kind === "moon" ? -12 : 1;
      try { if (kind === "planet") mag = A.Illumination(name as never, t).mag; } catch { /* keep default */ }
      return { name, kind, mag, v: unit(eq.ra * 15, eq.dec) };
    });
  };

  const ensureData = () => {
    if (cat || disposed) return;
    Promise.all([loadCatalog(), import("astronomy-engine")]).then(([c, A]) => {
      if (disposed) return;
      cat = c; astro = A;
      ephemeris();
      draw();
    }).catch(() => { /* sky is decorative: stay blank */ });
  };

  const draw = () => {
    const z = map.getZoom();
    const alpha = Math.max(0, Math.min(1, (FADE_FROM - z) / (FADE_FROM - FADE_FULL)));
    if (alpha <= 0) { if (canvas.style.display !== "none") canvas.style.display = "none"; return; }
    if (canvas.style.display === "none") canvas.style.display = "block";
    ensureData();
    if (Date.now() - lastEphem > 60_000) ephemeris();

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = container.clientWidth, h = container.clientHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#050608";
    ctx.fillRect(0, 0, w, h);
    if (!stars.length) return;

    const c = map.getCenter();
    const { right, up, fwd } = cameraBasis(c.lng, c.lat, map.getBearing(), map.getPitch());
    const pad = map.getPadding();
    const cx = (w + (pad.left || 0) - (pad.right || 0)) / 2;
    const cy = (h + (pad.top || 0) - (pad.bottom || 0)) / 2;
    // The map camera's true FOV (~37 deg) shows only a handful of constellations; widen the sky's
    // lens so the backdrop reads as a star field. Orientation (center direction, bearing, pitch,
    // sidereal rotation) is still exact, only the angular scale is compressed.
    const fov = Math.max(map.getVerticalFieldOfView() * SKY_FOV_SCALE, 60);
    const focal = (h / 2) / Math.tan((Math.min(fov, 110) * D) / 2);
    const proj = (v: V3): [number, number] | null => {
      const e = toEcef(v, gast);
      const zc = dot(e, fwd);
      if (zc <= 0.05) return null;
      const x = cx + (focal * dot(e, right)) / zc, y = cy - (focal * dot(e, up)) / zc;
      return x < -50 || y < -50 || x > w + 50 || y > h + 50 ? null : [x, y];
    };

    // Constellation figures, then names, then stars on top.
    ctx.globalAlpha = alpha * 0.22;
    ctx.strokeStyle = "#8fa3c8";
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    for (const l of lines) {
      let prev: [number, number] | null = null;
      for (const v of l) {
        const p = proj(v);
        if (p && prev) { ctx.moveTo(prev[0], prev[1]); ctx.lineTo(p[0], p[1]); }
        prev = p;
      }
    }
    ctx.stroke();

    ctx.globalAlpha = alpha * 0.38;
    ctx.fillStyle = "#9aa6bd";
    ctx.font = "500 9.5px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if (ctx.letterSpacing !== undefined) ctx.letterSpacing = "1.5px";
    for (const n of names) { const p = proj(n.v); if (p) ctx.fillText(n.text, p[0], p[1]); }
    if (ctx.letterSpacing !== undefined) ctx.letterSpacing = "0px";

    for (const s of stars) {
      const p = proj(s.v);
      if (!p) continue;
      const r = Math.max(0.5, (6 - s.mag) * 0.36);
      ctx.globalAlpha = alpha * Math.min(1, 0.3 + (6 - s.mag) * 0.16);
      ctx.fillStyle = s.color;
      if (r < 0.9) ctx.fillRect(p[0] - r, p[1] - r, r * 2, r * 2);
      else { ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, Math.PI * 2); ctx.fill(); }
    }

    // Sun, Moon, planets with labels.
    ctx.font = "500 11px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "left";
    for (const b of bodies) {
      const p = proj(b.v);
      if (!p) continue;
      const [x, y] = p;
      if (b.kind === "sun") {
        const g = ctx.createRadialGradient(x, y, 0, x, y, 46);
        g.addColorStop(0, "rgba(255,247,225,1)"); g.addColorStop(0.18, "rgba(255,226,170,0.85)"); g.addColorStop(1, "rgba(255,200,120,0)");
        ctx.globalAlpha = alpha; ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(x, y, 46, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#fffaf0"; ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.fill();
      } else if (b.kind === "moon") {
        ctx.globalAlpha = alpha * 0.95; ctx.fillStyle = "#d9d8d2";
        ctx.beginPath(); ctx.arc(x, y, 5.5, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.globalAlpha = alpha; ctx.fillStyle = b.name === "Mars" ? "#ffb48a" : "#fff3d6";
        ctx.beginPath(); ctx.arc(x, y, Math.max(1.6, 2.6 - b.mag * 0.35), 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = alpha * 0.8; ctx.fillStyle = "#c9c6bd";
      ctx.fillText(b.name, x + (b.kind === "sun" ? 12 : 8), y + 1);
    }
    ctx.globalAlpha = 1;
  };

  map.on("render", draw);
  map.on("resize", draw);
  // Earth turns ~0.25 deg/min under the sky: refresh occasionally even when the camera is still.
  const timer = setInterval(() => { if (map.getZoom() < FADE_FROM) draw(); }, 15_000);
  draw();

  return () => {
    disposed = true;
    clearInterval(timer);
    map.off("render", draw); map.off("resize", draw);
    canvas.remove();
  };
}
