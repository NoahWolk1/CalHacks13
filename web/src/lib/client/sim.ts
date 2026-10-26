// Client-side fleet simulation. Server events say *what* each agent is doing; this turns that
// into motion: vehicles launch from a command post, patrol the region (drones fly survey lanes,
// cars drive real streets, satellites make passes), and fly to each finding before it "drops".

import * as turf from "@turf/turf";
import type { AgentConfig, Finding, Region, VehicleKind } from "@/lib/types";
import { hexToRgb } from "./icons";
import { anchorOf } from "@/lib/geo";

type LL = [number, number];
type Mode = "staged" | "deploying" | "patrol" | "parked";
const STALE_S = 8;

export interface Vehicle {
  id: string;
  name: string;
  kind: VehicleKind;
  color: [number, number, number];
  pos: LL;
  heading: number; // degrees clockwise from north
  mode: Mode;
  done: boolean;
  error: boolean;
  waypoints: LL[];
  queue: { id: string; at: LL; instant?: boolean; t: number }[];
  trail: { path: [number, number][]; ts: number[] };
  beams: { from: LL; to: LL; until: number; color: [number, number, number] }[];
  lastTrail: number;
  index: number;
  pulse: number; // time of last reveal, for glow pulses
}

export class Fleet {
  vehicles = new Map<string, Vehicle>();
  region: Region | null = null;
  private origin: LL = [0, 0];
  private kx = 1; // meters per degree lng
  private ky = 110_540;
  private diag = 1000; // region diagonal in meters
  private roads: { nodes: LL[]; adj: number[][] } | null = null;
  private base: LL = [0, 0];

  constructor(private reveal: (id: string) => void) {}

  // ── setup ────────────────────────────────────────────────────────────────
  setRegion(r: Region | null) {
    // Region swapped mid-run: findings still waiting for their vehicle would otherwise never appear.
    // (Not on a same-region reset at run start: those ids belong to the previous run.)
    if (r?.bbox.join() !== this.region?.bbox.join()) for (const v of this.vehicles.values()) v.queue.forEach((q) => this.reveal(q.id));
    this.vehicles.clear();
    this.roads = null;
    this.region = r;
    if (!r) return;
    this.origin = r.center;
    this.kx = 111_320 * Math.cos((r.center[1] * Math.PI) / 180);
    const [a, b, c, d] = r.bbox;
    this.diag = Math.hypot((c - a) * this.kx, (d - b) * this.ky);
    // Command post: just inside the middle of the region's south edge (the side panels hide the corners).
    this.base = this.clampIn([(a + c) / 2, b], 0.9);
  }

  setRoads(lines: LL[][]) {
    if (!this.region) return;
    const key = (p: LL) => `${p[0].toFixed(5)},${p[1].toFixed(5)}`;
    const idx = new Map<string, number>();
    const nodes: LL[] = [];
    const adj: number[][] = [];
    const id = (p: LL) => {
      const k = key(p);
      let i = idx.get(k);
      if (i === undefined) { i = nodes.length; idx.set(k, i); nodes.push(p); adj.push([]); }
      return i;
    };
    for (const line of lines) {
      for (let i = 1; i < line.length; i++) {
        if (!this.inside(line[i - 1]) || !this.inside(line[i])) continue;
        const u = id(line[i - 1]), v = id(line[i]);
        if (u !== v) { adj[u].push(v); adj[v].push(u); }
      }
    }
    this.roads = nodes.length > 20 ? { nodes, adj } : null;
  }

  get commandPost() { return this.base; }

  ensure(agent: AgentConfig): Vehicle {
    let v = this.vehicles.get(agent.id);
    if (v) return v;
    const index = this.vehicles.size;
    const ang = (index / 9) * Math.PI * 0.5; // fan vehicles around the command post
    const b = this.toM(this.base);
    v = {
      id: agent.id, name: agent.name, kind: agent.vehicle, color: hexToRgb(agent.color),
      pos: this.clampIn(this.fromM([b[0] + Math.cos(ang) * 40 - 20, b[1] + Math.sin(ang) * 40 - 20])),
      heading: 45, mode: "staged", done: false, error: false, waypoints: [], queue: [],
      trail: { path: [], ts: [] }, beams: [], lastTrail: 0, index, pulse: 0,
    };
    this.vehicles.set(agent.id, v);
    return v;
  }

  // ── events ───────────────────────────────────────────────────────────────
  onStatus(agent: AgentConfig, status: string, targets?: { lng: number; lat: number }[]) {
    const v = this.ensure(agent);
    if (status === "deploying") {
      v.done = false; v.error = false;
      v.mode = "deploying";
      v.waypoints = targets?.length ? this.orderNearest(v.pos, targets.map((t) => this.clampIn([t.lng, t.lat]))) : [this.entryPoint(v)];
    } else if (status === "scanning") {
      if (v.mode !== "deploying") v.mode = "patrol";
    } else if (status === "done") {
      v.done = true;
    } else if (status === "error") {
      v.done = true; v.error = true;
    }
  }

  onFinding(f: Finding) {
    const v = this.vehicles.get(f.worker_id);
    const at = anchorOf(f.geometry);
    const areaLevel = !!f.props?.areaLevel;
    if (!v) { this.reveal(f.id); return; }
    const t = performance.now() / 1000;
    if (areaLevel || f.props?.offRegion || !this.region || !this.inside(at)) {
      // Not a place to fly to: reveal with a beam from wherever the agent is.
      v.queue.push({ id: f.id, at, instant: true, t });
    } else v.queue.push({ id: f.id, at, t });
  }

  // ── simulation ───────────────────────────────────────────────────────────
  tick(now: number, dt: number) {
    for (const v of this.vehicles.values()) this.step(v, now, Math.min(dt, 0.05));
  }

  private step(v: Vehicle, now: number, dt: number) {
    v.beams = v.beams.filter((b) => b.until > now);

    // Wall-clock backstop: dt is capped per frame, so on a slow GPU (or a tab that was hidden) the
    // fleet crawls; never let a finding wait more than STALE_S of real time to appear.
    if (v.queue.length && now - v.queue[0].t > STALE_S) {
      const stale = v.queue.filter((q) => now - q.t > STALE_S);
      v.queue = v.queue.filter((q) => now - q.t <= STALE_S);
      stale.forEach((q, i) => (i < 3 ? this.drop(v, q, now) : this.reveal(q.id)));
    }

    // Instant reveals (area-level findings) fire as soon as the agent is on station, staggered.
    if (v.mode !== "staged" && v.mode !== "deploying") {
      const inst = v.queue.findIndex((q) => q.instant);
      if (inst >= 0 && now - v.pulse > 0.18) {
        const q = v.queue.splice(inst, 1)[0];
        this.drop(v, q, now);
      }
      // Too many queued places: drop the furthest ones with beams so pacing stays snappy.
      const spatial = v.queue.filter((q) => !q.instant);
      if (spatial.length > 8 && now - v.pulse > 0.12) {
        const far = spatial.sort((p, q) => this.dist(q.at, v.pos) - this.dist(p.at, v.pos))[0];
        v.queue.splice(v.queue.indexOf(far), 1);
        this.drop(v, far, now);
      }
    }

    let target: LL | null = null;
    let speed = this.cruise(v);
    const visit = v.mode !== "staged" && v.mode !== "deploying" ? this.nearestQueued(v) : null;

    if (v.mode === "deploying") {
      target = v.waypoints[0] ?? null;
      speed = this.diag / 2.2;
      if (!target) v.mode = "patrol";
    } else if (visit) {
      target = visit.at;
      speed = (this.diag / 3.2) * (1 + Math.min(1.5, v.queue.length / 6));
    } else if (v.mode === "patrol" && !v.done) {
      if (!v.waypoints.length) v.waypoints = this.patrol(v);
      target = v.waypoints[0] ?? null;
    } else if (v.done && !v.queue.length) {
      v.mode = "parked";
      // Idle drift so parked agents still feel alive.
      if (v.kind === "drone" || v.kind === "satellite") v.heading = (v.heading + dt * 12) % 360;
    }

    if (target) {
      const p = this.toM(v.pos), t = this.toM(target);
      const dx = t[0] - p[0], dy = t[1] - p[1];
      const d = Math.hypot(dx, dy);
      const stepM = speed * dt;
      if (d <= Math.max(stepM, 2)) {
        v.pos = target;
        if (visit) { v.queue.splice(v.queue.indexOf(visit), 1); this.drop(v, visit, now, false); }
        else {
          v.waypoints.shift();
          if (v.mode === "deploying" && !v.waypoints.length) v.mode = "patrol";
        }
      } else {
        // Clamped so a leg that cuts across a concave edge still never leaves the region.
        v.pos = this.clampIn(this.fromM([p[0] + (dx / d) * stepM, p[1] + (dy / d) * stepM]));
        const want = (Math.atan2(dx, dy) * 180) / Math.PI;
        v.heading = lerpAngle(v.heading, want, Math.min(1, dt * (v.kind === "car" ? 14 : 6)));
      }
    }

    if (now - v.lastTrail > 0.06) {
      v.lastTrail = now;
      v.trail.path.push([...v.pos] as [number, number]);
      v.trail.ts.push(now);
      if (v.trail.path.length > 260) { v.trail.path.shift(); v.trail.ts.shift(); }
    }
  }

  private drop(v: Vehicle, q: { id: string; at: LL }, now: number, beam = true) {
    this.reveal(q.id);
    v.pulse = now;
    if (beam || this.dist(q.at, v.pos) > 3) v.beams.push({ from: v.pos, to: q.at, until: now + 0.7, color: v.color });
    else v.beams.push({ from: v.pos, to: q.at, until: now + 0.35, color: v.color });
  }

  private nearestQueued(v: Vehicle) {
    let best: Vehicle["queue"][number] | null = null, bd = Infinity;
    for (const q of v.queue) {
      if (q.instant) continue;
      const d = this.dist(q.at, v.pos);
      if (d < bd) { bd = d; best = q; }
    }
    return best;
  }

  private cruise(v: Vehicle) {
    const k: Record<VehicleKind, number> = { drone: 1 / 7, car: 1 / 9, rover: 1 / 12, satellite: 1 / 3.2, boat: 1 / 10 };
    return this.diag * k[v.kind] * (v.done ? 0.4 : 1);
  }

  private entryPoint(v: Vehicle): LL {
    const pts = this.patrol(v);
    return pts[0] ?? this.region!.center;
  }

  /** Patrol route by vehicle type. */
  private patrol(v: Vehicle): LL[] {
    const r = this.region!;
    const [a, b, c, d] = r.bbox;
    if (v.kind === "drone") {
      // Lawnmower survey lanes, each drone offset so they don't overlap.
      const lanes = 6, out: LL[] = [];
      const phase = ((v.index * 0.37) % 1) / lanes;
      for (let i = 0; i < lanes; i++) {
        const t = Math.min(0.999, (i + 0.5) / lanes + phase);
        const x = a + t * (c - a);
        const ends: LL[] = [[x, b + (d - b) * 0.04], [x, d - (d - b) * 0.04]];
        if (i % 2) ends.reverse();
        for (const e of ends) if (turf.booleanPointInPolygon(e, r.polygon)) out.push(e);
        if (!out.length) out.push(r.center);
      }
      return v.index % 2 ? out.reverse() : out;
    }
    if (v.kind === "satellite") {
      // Long straight passes across the region at a per-satellite angle, edge to edge.
      const ang = ((v.index * 47 + 20) * Math.PI) / 180;
      const o = this.toM(r.center), L = this.diag;
      return [this.clampIn(this.fromM([o[0] - Math.sin(ang) * L, o[1] - Math.cos(ang) * L])), this.clampIn(this.fromM([o[0] + Math.sin(ang) * L, o[1] + Math.cos(ang) * L]))];
    }
    // Ground vehicles: drive the real street graph if we have it.
    if (this.roads) return this.roadWalk(v.pos, 28);
    const out: LL[] = [];
    let cur = v.pos;
    for (let i = 0; i < 8; i++) {
      const nxt = this.randomInside();
      const corner: LL = [nxt[0], cur[1]]; // Manhattan-style L moves, unless the corner falls outside
      out.push(...(this.inside(corner) ? [corner, nxt] : [nxt]));
      cur = nxt;
    }
    return out;
  }

  private roadWalk(from: LL, steps: number): LL[] {
    const { nodes, adj } = this.roads!;
    let cur = 0, bd = Infinity;
    for (let i = 0; i < nodes.length; i++) {
      const d = this.dist(nodes[i], from);
      if (d < bd && adj[i].length) { bd = d; cur = i; }
    }
    const out: LL[] = [nodes[cur]];
    let prev = -1;
    for (let s = 0; s < steps; s++) {
      const opts = adj[cur].filter((n) => n !== prev);
      const choices = opts.length ? opts : adj[cur];
      if (!choices.length) break;
      // Prefer going straight, sometimes turn.
      const h = prev >= 0 ? this.bearing(nodes[prev], nodes[cur]) : Math.random() * 360;
      choices.sort((p, q) => angDiff(this.bearing(nodes[cur], nodes[p]), h) - angDiff(this.bearing(nodes[cur], nodes[q]), h));
      const pick = Math.random() < 0.7 ? choices[0] : choices[Math.floor(Math.random() * choices.length)];
      prev = cur; cur = pick;
      out.push(nodes[cur]);
    }
    return out;
  }

  private randomInside(): LL {
    const r = this.region!;
    const [a, b, c, d] = r.bbox;
    for (let i = 0; i < 30; i++) {
      const p: LL = [a + Math.random() * (c - a), b + Math.random() * (d - b)];
      if (turf.booleanPointInPolygon(p, r.polygon)) return p;
    }
    return r.center;
  }

  private inside(p: LL) { return !this.region || turf.booleanPointInPolygon(p, this.region.polygon); }

  /** p if it's in the region, else the region's edge on the way from its center to p, pulled in by `keep`. */
  private clampIn(p: LL, keep = 0.97): LL {
    if (this.inside(p)) return p;
    const o = this.region!.center;
    let lo = 0, hi = 1;
    for (let i = 0; i < 14; i++) {
      const m = (lo + hi) / 2;
      if (this.inside([o[0] + (p[0] - o[0]) * m, o[1] + (p[1] - o[1]) * m])) lo = m; else hi = m;
    }
    const t = lo * keep;
    return [o[0] + (p[0] - o[0]) * t, o[1] + (p[1] - o[1]) * t];
  }

  private orderNearest(from: LL, pts: LL[]): LL[] {
    const rest = [...pts], out: LL[] = [];
    let cur = from;
    while (rest.length) {
      rest.sort((p, q) => this.dist(p, cur) - this.dist(q, cur));
      cur = rest.shift()!;
      out.push(cur);
    }
    return out;
  }

  // ── projection helpers (local equirectangular, meters) ──────────────────
  private toM(p: LL): LL { return [(p[0] - this.origin[0]) * this.kx, (p[1] - this.origin[1]) * this.ky]; }
  private fromM(m: LL): LL { return [this.origin[0] + m[0] / this.kx, this.origin[1] + m[1] / this.ky]; }
  private dist(p: LL, q: LL) { const a = this.toM(p), b = this.toM(q); return Math.hypot(a[0] - b[0], a[1] - b[1]); }
  private bearing(p: LL, q: LL) { const a = this.toM(p), b = this.toM(q); return (Math.atan2(b[0] - a[0], b[1] - a[1]) * 180) / Math.PI; }
}

const angDiff = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);
function lerpAngle(a: number, b: number, t: number) {
  const d = ((b - a + 540) % 360) - 180;
  return (a + d * t + 360) % 360;
}
