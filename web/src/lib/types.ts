// Shared contracts between the agent runtime (server) and the map UI (client).
// See README §3b for the finding schema and §3c for agent configs.

import type { Feature, Geometry, Polygon, MultiPolygon } from "geojson";

/** The area the user selected. Always normalized to a polygon (pins become circles). */
export interface Region {
  kind: "box" | "polygon" | "pin";
  polygon: Feature<Polygon | MultiPolygon>;
  /** [minLng, minLat, maxLng, maxLat] */
  bbox: [number, number, number, number];
  center: [number, number];
  /** Pin mode only. */
  radiusM?: number;
  /** Reverse-geocoded label, filled in server-side. */
  label?: string;
}

/** README §3b: every worker emits these. */
export interface Finding {
  id: string;
  claim: string;
  geometry: Geometry;
  source_url?: string;
  source_type: string;
  observed_at?: string;
  confidence: number;
  worker_id: string;
  /** Short tag the UI uses for color/icon, e.g. "flood", "permit". */
  category: string;
  /** 0..1 how notable this is for the current question. Drives pin size. */
  severity?: number;
  /** Arbitrary structured details shown in the inspector. */
  props?: Record<string, unknown>;
}

/** How an agent is drawn on the map. Purely visual. */
export type VehicleKind = "drone" | "car" | "rover" | "satellite" | "boat";

/** Tool primitives a worker (built-in or generated) may use. README §3c. */
export type ToolPrimitive = "http_get" | "scrape" | "search" | "transcribe" | "llm" | "geocode" | "osm";

/** README §3c: an agent is just a saved config. Built-ins also carry a `run` impl. */
export interface AgentConfig {
  id: string;
  name: string;
  /** One line the orchestrator reads to decide relevance. */
  description: string;
  vehicle: VehicleKind;
  color: string; // hex
  tools: ToolPrimitive[];
  dataSources: string[];
  /** Region coverage hint, e.g. "US", "San Francisco". Used by the planner. */
  coverage: string;
  builtin: boolean;
  /** For generated agents: the prompt that defines it. */
  prompt?: string;
  createdBy?: string; // parent agent id, or "user"
  /** Spawned mid-run and not yet kept: invisible to other runs' planners and to the Hub. */
  temporary?: boolean;
  /** Env vars still unset (sponsor/API keys). Set only on configs sent to the client; such agents sit out of plans. */
  needsKeys?: string[];
}

export interface WorkerTask {
  region: Region;
  /** Optional narrower instruction from the orchestrator ("check these parcels"). */
  focus?: string;
  /** Optional specific points to inspect (re-dispatch). */
  targets?: { id: string; lng: number; lat: number; label?: string }[];
  question?: string;
  /** A photo attached to the question (base64 JPEG): only the Photo Locator reads it. */
  photo?: RunPhoto;
}

/** Sent with the run request, never stored with the run or its events. */
export type RunPhoto = { data: string; mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif" };

export interface WorkerContext {
  task: WorkerTask;
  emit: (f: Omit<Finding, "id" | "worker_id">) => void;
  log: (msg: string) => void;
  signal: AbortSignal;
}

export interface Worker extends AgentConfig {
  run: (ctx: WorkerContext) => Promise<void>;
}

export type AgentStatus = "queued" | "deploying" | "scanning" | "done" | "error" | "idle";

export interface Insight {
  id: string;
  title: string;
  body: string;
  kind: "risk" | "opportunity" | "conflict" | "note";
  severity: number; // 0..1
  findingIds: string[];
}

export interface PlanStep {
  agentId: string;
  reason: string;
  focus?: string;
}

/** Everything the server streams to the client over SSE. */
export type RunEvent =
  /** profileId is "auto" until the `routed` event when the user left the orchestrator on Auto. */
  | { type: "run_started"; runId: string; mode: RunMode; profileId: string; region: Region; question?: string; llm: boolean }
  /** Which orchestrator profile runs this mission. auto: picked by the planner (or keyword router), else chosen by the user. */
  | { type: "routed"; profileId: string; reason: string; auto: boolean }
  | { type: "region_labeled"; label: string }
  | { type: "thought"; agentId: string; text: string }
  | { type: "plan"; steps: PlanStep[]; rationale: string }
  | { type: "agent_status"; agentId: string; status: AgentStatus; detail?: string; dispatchId: string; focus?: string; targets?: WorkerTask["targets"] }
  | { type: "agent_spawned"; agent: AgentConfig; parentId: string }
  | { type: "agent_gap"; need: string; parentId: string }
  | { type: "agent_log"; agentId: string; text: string }
  | { type: "finding"; finding: Finding; dispatchId: string }
  | { type: "insight"; insight: Insight }
  | { type: "answer_delta"; text: string }
  | { type: "run_done"; durationMs: number }
  | { type: "error"; message: string };

export type RunMode = "ask" | "insights";

export interface RunRequest {
  mode: RunMode;
  /** A profile id, or "auto" / omitted to let the orchestrator route the question. */
  profileId?: string;
  region: Region;
  question?: string;
  /** Extra agent ids the user wants included (e.g. custom ones from the hub). */
  includeAgents?: string[];
  /** A photo to supplement the question: located by the Photo Locator before planning. */
  photo?: RunPhoto;
}

/** README §2: one orchestrator per user type. */
export interface OrchestratorProfile {
  id: string;
  name: string;
  persona: string;
  tagline: string;
  icon: string; // lucide icon name
  /** Agents used in Insights mode (no question). */
  defaultAgents: string[];
  /** Domain knowledge injected into the planner + synthesizer prompts. */
  domainPrompt: string;
  sampleQuestions: string[];
}
