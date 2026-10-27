// Client-side animation for /sky, the space counterpart of sim.ts's fleet. The run's events say
// *what* each sky agent is doing; this turns that into motion. Each agent is summoned (a warp ring
// at a command post on the cone's southern rim), flies out and works the research cone in its own
// pattern (survey lanes, spirals, passes, orbits, a raster scan, or hopping between the stars whose
// light curves it is analysing), beams to what it finds, and pulses on strong finds; unvetted
// candidates keep a pulsing marker. Everything lives in cone-local unit-disc coordinates (0,0 =
// cone centre, radius 1 = cone edge, x toward east, y toward north) and is clamped inside the disc.
import { isNewFind, type AnalysisStar, type Cone, type SkyObject, type SkySourceReport, type StarResult } from "@/lib/sky/types";

export type P = [number, number];
export type Pattern = "lanes" | "spiral" | "passes" | "orbit" | "raster" | "hop";
type Mode = "summoning" | "working" | "done" | "error";
type RGB = [number, number, number];

export interface Probe {
  id: string;
  name: string;
  color: RGB;
  pattern: Pattern;
  index: number;
  pos: P;
  heading: number; // radians, 0 = +x
  mode: Mode;
  born: number; // when summoned (s); the probe appears once now >= born
  route: P[];
  queue: { at: P; strong: boolean }[];
  beams: { to: P; t0: number; until: number; strong: boolean }[];
  trail: P[];
  lastTrail: number;
  pulse: number; // time of the last strong find
  scan: number; // radar sweep angle
  stars: P[]; // hop targets (analysis agents)
}

export type Ring = { at: P; t0: number; dur: number; color: RGB; size: number };
export type Mark = { at: P; color: RGB; since: number; strong: boolean };

/** Agent ids, colours (matching lib/sky/agents.ts) and work patterns. */
export const SKY_PROBES: { id: string; name: string; color: string; pattern: Pattern }[] = [
  { id: "simbad", name: "SIMBAD", color: "#8fb3ff", pattern: "lanes" },
  { id: "exoplanets", name: "Exoplanet Archive", color: "#6dbf8b", pattern: "spiral" },
  { id: "horizons", name: "Horizons", color: "#e8853d", pattern: "passes" },
  { id: "telescopes", name: "Telescope Archive", color: "#5ec8d8", pattern: "orbit" },
  { id: "observer", name: "Observer", color: "#e58fb5", pattern: "raster" },
  { id: "transits", name: "Transit Hunter", color: "#f2c35b", pattern: "hop" },
  { id: "variability", name: "Variability", color: "#b39dff", pattern: "hop" },
  { id: "vetting", name: "Vetter", color: "#ff8f7a", pattern: "hop" },
];

const hexRgb = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const KEEP = 0.94; // probes stay this far inside the rim
const SPEED = 0.42; // disc radii per second

/** Clamps a point into the disc (radius `keep`). */
export function clampDisc(p: P, keep = KEEP): P {
  const r = Math.hypot(p[0], p[1]);
  return r <= keep ? p : [(p[0] / r) * keep, (p[1] / r) * keep];
}

/** (ra, dec) to cone-local disc coordinates (gnomonic-ish tangent offsets, fine for cones <= 3°). */
export function toDisc(c: Cone, ra: number, dec: number, keep = KEEP): P {
  let dra = ra - c.ra;
  if (dra > 180) dra -= 360;
  if (dra < -180) dra += 360;
  return clampDisc([(dra * Math.cos((c.dec * Math.PI) / 180)) / c.radius, (dec - c.dec) / c.radius], keep);
}

export type SkyActivity = {
  run: number; // increments per research run (0 = nothing yet)
  status: "idle" | "running" | "summarising" | "done" | "error";
  sources: SkySourceReport[];
  objects: SkyObject[];
  stars: AnalysisStar[];
  starResults: StarResult[];
  analysisDone: boolean;
  observer: "idle" | "working" | "done";
};

export class SkyFleet {
  probes = new Map<string, Probe>();
  rings: Ring[] = [];
  marks: Mark[] = [];
  readonly base: P = [0, -0.86]; // command post: just inside the south rim
  private run = -1;
  private cone: Cone | null = null;
  private seen = new Set<string>();

  // ── events ───────────────────────────────────────────────────────────────
  /** Applies the run's state so far; idempotent (each report / result is acted on once). */
  sync(a: SkyActivity, cone: Cone, now: number) {
    if (a.run !== this.run || this.cone?.ra !== cone.ra || this.cone?.dec !== cone.dec || this.cone?.radius !== cone.radius) {
      this.probes.clear(); this.rings = []; this.marks = []; this.seen.clear();
      this.run = a.run; this.cone = cone;
    }
    if (a.status === "idle" || !a.run) return;
    const once = (key: string) => (this.seen.has(key) ? false : (this.seen.add(key), true));

    // Catalog agents are summoned together at the start of the run, staggered.
    if (once("start")) ["simbad", "exoplanets", "horizons", "telescopes"].forEach((id, i) => this.summon(id, now + i * 0.35));
    for (const s of a.sources) {
      if (!once(`src:${s.source}`)) continue;
      const mine = a.objects.filter((o) => o.source === s.source).slice(0, 6).map((o) => toDisc(cone, o.ra, o.dec));
      this.visit(s.source, mine, false);
      this.finish(s.source, s.status !== "error", now);
    }
    if (a.observer !== "idle" && once("observer")) this.summon("observer", now);
    if (a.observer === "done" && once("observer-done")) this.finish("observer", true, now);

    // Analysis agents: summoned when the light curves are picked; they hop between those stars.
    if (a.stars.length && once("analysis")) {
      const stars = a.stars.map((s) => toDisc(cone, s.ra, s.dec));
      ["transits", "variability", "vetting"].forEach((id, i) => {
        const p = this.summon(id, now + i * 0.3);
        // Each starts at a different star so they spread across the cone.
        p.stars = stars.map((_, k) => stars[(k + i * 3) % stars.length]);
      });
      // The Telescope Archive beams to every star whose light curve it fetched.
      this.visit("telescopes", stars, false);
    }
    const byTic = new Map(a.stars.map((s) => [s.tic, s]));
    for (const r of a.starResults) {
      if (!once(`star:${r.tic}`)) continue;
      const s = byTic.get(r.tic);
      if (!s) continue;
      const at = toDisc(cone, s.ra, s.dec);
      this.visit("transits", [at], !!r.transit?.detected);
      this.visit("variability", [at], !!r.variability?.variable);
      if (r.transit?.detected) this.visit("vetting", [at], false);
      if (r.variability?.variable) this.marks.push({ at, color: hexRgb("#b39dff"), since: now, strong: false });
    }
    if (a.analysisDone && once("analysis-done")) {
      for (const o of a.objects.filter((x) => x.category === "candidate" || isNewFind(x))) {
        const at = toDisc(cone, o.ra, o.dec);
        const fresh = isNewFind(o);
        this.visit("vetting", [at], fresh);
        if (fresh) this.marks.push({ at, color: hexRgb("#f2c35b"), since: now, strong: true });
      }
      ["transits", "variability", "vetting"].forEach((id) => this.finish(id, true, now));
    }
    if (a.status === "error") for (const p of this.probes.values()) if (p.mode !== "done") this.finish(p.id, false, now);
  }

  summon(id: string, at: number): Probe {
    const existing = this.probes.get(id);
    if (existing) return existing;
    const spec = SKY_PROBES.find((s) => s.id === id) ?? { id, name: id, color: "#ecebe6", pattern: "orbit" as Pattern };
    const index = this.probes.size;
    const p: Probe = {
      id, name: spec.name, color: hexRgb(spec.color), pattern: spec.pattern, index, pos: [...this.base] as P, heading: Math.PI / 2,
      mode: "summoning", born: at, route: [], queue: [], beams: [], trail: [], lastTrail: 0, pulse: 0, scan: index, stars: [],
    };
    this.probes.set(id, p);
    this.rings.push({ at: this.base, t0: at, dur: 0.9, color: p.color, size: 0.16 });
    return p;
  }

  /** Queues places for an agent to fly to and beam at (strong = a find worth a pulse). */
  visit(id: string, targets: P[], strong: boolean) {
    const p = this.probes.get(id);
    if (!p) return;
    for (const at of targets) p.queue.push({ at: clampDisc(at), strong });
  }

  finish(id: string, ok: boolean, now: number) {
    const p = this.probes.get(id);
    if (!p || p.mode === "done" || p.mode === "error") return;
    p.mode = ok ? "done" : "error";
    p.route = [];
    if (!ok) this.rings.push({ at: p.pos, t0: now, dur: 0.6, color: [228, 88, 88], size: 0.08 });
  }

  // ── simulation ───────────────────────────────────────────────────────────
  tick(now: number, dt: number) {
    dt = Math.min(dt, 0.05);
    this.rings = this.rings.filter((r) => now < r.t0 + r.dur);
    for (const p of this.probes.values()) this.step(p, now, dt);
  }

  private step(p: Probe, now: number, dt: number) {
    if (now < p.born) return;
    p.beams = p.beams.filter((b) => b.until > now);
    p.scan += dt * (p.mode === "done" ? 0.8 : 2.4);
    if (p.mode === "summoning" && now > p.born + 0.6) p.mode = "working";
    if (p.mode === "summoning") return;

    let target: P | null = null;
    let speed = SPEED * (p.mode === "working" ? 1 : 0.5);
    const visit = p.queue.length ? nearest(p.pos, p.queue) : null;
    if (visit) {
      target = visit.at;
      speed = SPEED * (1.3 + Math.min(1.5, p.queue.length / 5));
    } else if (p.mode === "working") {
      if (!p.route.length) p.route = this.pattern(p);
      target = p.route[0] ?? null;
    } else {
      // Done (or failed): drift back and hold a slow orbit near the command post.
      const k = p.index * 0.7 + now * 0.25;
      target = clampDisc([this.base[0] + Math.cos(k) * 0.18, this.base[1] + 0.14 + Math.sin(k) * 0.08]);
      speed = SPEED * 0.45;
    }

    if (target) {
      const dx = target[0] - p.pos[0], dy = target[1] - p.pos[1];
      const d = Math.hypot(dx, dy), stepD = speed * dt;
      if (d <= Math.max(stepD, 0.004)) {
        p.pos = target;
        if (visit) {
          p.queue.splice(p.queue.indexOf(visit), 1);
          p.beams.push({ to: visit.at, t0: now, until: now + (visit.strong ? 1.4 : 0.7), strong: visit.strong });
          if (visit.strong) { p.pulse = now; this.rings.push({ at: visit.at, t0: now, dur: 1.2, color: p.color, size: 0.12 }); }
        } else if (p.mode === "working") p.route.shift();
      } else {
        p.pos = clampDisc([p.pos[0] + (dx / d) * stepD, p.pos[1] + (dy / d) * stepD]);
        p.heading = lerpAngle(p.heading, Math.atan2(dy, dx), Math.min(1, dt * 7));
      }
    }
    // Beam to the nearest queued star every so often while hopping, so analysis looks like work.
    if (p.pattern === "hop" && p.mode === "working" && !visit && p.stars.length && now - (p.beams.at(-1)?.t0 ?? 0) > 1.1) {
      const s = p.stars[Math.floor(now * 0.9 + p.index) % p.stars.length];
      p.beams.push({ to: s, t0: now, until: now + 0.5, strong: false });
    }
    if (now - p.lastTrail > 0.05) {
      p.lastTrail = now;
      p.trail.push([...p.pos] as P);
      if (p.trail.length > 48) p.trail.shift();
    }
  }

  /** Work route by pattern, offset per agent so they don't overlap. All points inside the disc. */
  private pattern(p: Probe): P[] {
    const i = p.index;
    switch (p.pattern) {
      case "lanes": {
        // Lawnmower survey lanes, north-south.
        const lanes = 6, out: P[] = [];
        for (let k = 0; k < lanes; k++) {
          const x = -0.78 + (1.56 * (k + 0.5)) / lanes, h = Math.sqrt(1 - x * x) * 0.86;
          out.push(...((k % 2 ? [[x, h], [x, -h]] : [[x, -h], [x, h]]) as P[]));
        }
        return out;
      }
      case "spiral":
        return Array.from({ length: 28 }, (_, k) => { const t = k / 27, a = t * Math.PI * 5 + i; return clampDisc([Math.cos(a) * (0.12 + 0.78 * t), Math.sin(a) * (0.12 + 0.78 * t)]); });
      case "passes": {
        // Long straight chords at a per-agent angle, rim to rim.
        const a = ((i * 47 + 20) * Math.PI) / 180;
        return [clampDisc([-Math.cos(a), -Math.sin(a)]), clampDisc([Math.cos(a), Math.sin(a)]), clampDisc([-Math.cos(a + 0.9), -Math.sin(a + 0.9)])];
      }
      case "orbit":
        return Array.from({ length: 16 }, (_, k) => { const a = (k / 16) * Math.PI * 2 + i; return [Math.cos(a) * 0.62, Math.sin(a) * 0.62] as P; });
      case "raster": {
        // East-west scan lines from north to south, like reading an image.
        const out: P[] = [];
        for (let k = 0; k < 7; k++) {
          const y = 0.8 - (1.6 * k) / 6, w = Math.sqrt(1 - y * y) * 0.88;
          out.push(...((k % 2 ? [[w, y], [-w, y]] : [[-w, y], [w, y]]) as P[]));
        }
        return out;
      }
      case "hop":
        if (p.stars.length) return [...p.stars];
        return Array.from({ length: 6 }, (_, k) => { const a = (k / 6) * Math.PI * 2 + i; return [Math.cos(a) * 0.35, Math.sin(a) * 0.35] as P; });
    }
  }
}

function nearest<T extends { at: P }>(from: P, xs: T[]): T {
  let best = xs[0], bd = Infinity;
  for (const x of xs) { const d = Math.hypot(x.at[0] - from[0], x.at[1] - from[1]); if (d < bd) { bd = d; best = x; } }
  return best;
}

function lerpAngle(a: number, b: number, t: number) {
  const d = ((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  return a + d * t;
}
