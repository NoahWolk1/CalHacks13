"use client";
import { create } from "zustand";
import type { LiveConfig } from "./runClient";
import type { AgentConfig, AgentStatus, Finding, Insight, OrchestratorProfile, PlanStep, Region, RunEvent, RunMode } from "@/lib/types";

export type Tool = "box" | "polygon" | "pin" | "pan";

export interface AgentRunState {
  status: AgentStatus;
  detail?: string;
  logs: string[];
  findings: number;
  focus?: string;
  redispatched?: boolean;
  spawnedBy?: string;
  /** For spawned agents, what the user chose after the run. */
  decision?: "kept" | "discarded";
}

export interface Thought { agentId: string; text: string; at: number; kind?: "gap" | "plan" | "info" }

interface State {
  // catalog
  agents: AgentConfig[];
  profiles: OrchestratorProfile[];
  llm: boolean;
  /** Live backend reported by /api/agents (null until the catalog loads). */
  live: LiveConfig | null;
  // inputs
  tool: Tool;
  pinRadius: number;
  region: Region | null;
  /** The picker's selection: "auto" (the orchestrator routes the question) or a profile id. */
  profileId: string;
  mode: RunMode;
  question: string;
  // run
  /** Shared run id of the mission on screen (SpacetimeDB or Convex; null in SSE mode). */
  runId: string | null;
  running: boolean;
  runStartedAt: number | null;
  runDurationMs: number | null;
  plan: PlanStep[];
  /** The profile running this mission (from the `routed` event). */
  routed: { profileId: string; reason: string; auto: boolean } | null;
  thoughts: Thought[];
  agentState: Record<string, AgentRunState>;
  findings: Record<string, Finding>;
  findingOrder: string[];
  revealed: Record<string, number>; // finding id → reveal time (ms)
  insights: Insight[];
  answer: string;
  error: string | null;
  // ui
  selectedFinding: string | null;
  hoveredInsight: string | null;
  selectedInsight: string | null;
  rightTab: "agents" | "insights" | "answer" | "findings";
  hubOpen: boolean;

  set: (p: Partial<State>) => void;
  resetRun: () => void;
  apply: (e: RunEvent) => void;
  reveal: (id: string) => void;
}

const emptyRun = {
  running: false, runStartedAt: null, runDurationMs: null, plan: [], routed: null, thoughts: [], agentState: {}, findings: {}, findingOrder: [],
  revealed: {}, insights: [], answer: "", error: null, selectedFinding: null, hoveredInsight: null, selectedInsight: null,
};

export const useStore = create<State>((set, get) => ({
  agents: [], profiles: [], llm: false, live: null,
  runId: null, tool: "box", pinRadius: 450, region: null, profileId: "auto", mode: "insights", question: "",
  ...emptyRun,
  rightTab: "agents", hubOpen: false,

  set: (p) => set(p),
  resetRun: () => set({ ...emptyRun }),
  reveal: (id) => { if (!get().revealed[id]) set((s) => ({ revealed: { ...s.revealed, [id]: performance.now() } })); },

  apply: (e) => set((s) => {
    const think = (t: Thought) => ({ thoughts: [...s.thoughts, t] });
    const agent = (id: string): AgentRunState => s.agentState[id] ?? { status: "queued", logs: [], findings: 0 };
    switch (e.type) {
      case "run_started": return { running: true, runStartedAt: Date.now(), llm: e.llm };
      case "region_labeled": return { region: s.region ? { ...s.region, label: e.label } : s.region };
      case "thought": return think({ agentId: e.agentId, text: e.text, at: Date.now() });
      case "plan": return { plan: e.steps };
      // An auto-routed mission shows Auto selected with the routed profile marked (also for viewers,
      // whose picker was hydrated from the run row's routed profile).
      case "routed": return { routed: { profileId: e.profileId, reason: e.reason, auto: e.auto }, ...(e.auto ? { profileId: "auto" } : {}) };
      case "agent_status": {
        const prev = agent(e.agentId);
        const redispatched = !!(e.targets?.length) || prev.redispatched;
        return { agentState: { ...s.agentState, [e.agentId]: { ...prev, status: e.status, detail: e.detail ?? (e.status === "deploying" ? undefined : prev.detail), focus: e.focus ?? prev.focus, redispatched } } };
      }
      case "agent_log": {
        const prev = agent(e.agentId);
        return { agentState: { ...s.agentState, [e.agentId]: { ...prev, logs: [...prev.logs, e.text].slice(-6) } } };
      }
      case "agent_gap": return think({ agentId: e.parentId, text: `Capability gap: "${e.need}". Requesting a new agent…`, at: Date.now(), kind: "gap" });
      case "agent_spawned": return { agents: [...s.agents.filter((a) => a.id !== e.agent.id), e.agent], agentState: { ...s.agentState, [e.agent.id]: { status: "queued", logs: [], findings: 0, spawnedBy: e.parentId } } };
      case "finding": {
        const prev = agent(e.finding.worker_id);
        return {
          findings: { ...s.findings, [e.finding.id]: e.finding }, findingOrder: [...s.findingOrder, e.finding.id],
          agentState: { ...s.agentState, [e.finding.worker_id]: { ...prev, findings: prev.findings + 1 } },
        };
      }
      case "insight": return { insights: [...s.insights, e.insight], rightTab: s.rightTab === "agents" && s.insights.length === 0 ? "insights" : s.rightTab };
      case "answer_delta": return { answer: s.answer + e.text, rightTab: s.answer ? s.rightTab : "answer" };
      case "run_done": return { running: false, runDurationMs: e.durationMs };
      case "error": return { running: false, error: e.message };
    }
  }),
}));

export const agentById = (id: string) => useStore.getState().agents.find((a) => a.id === id);

// The picker selection persists per browser (like the layout prefs). Only explicit picks are saved,
// so opening someone's shared mission doesn't change your default.
const PROFILE_KEY = "geoswarm.profile";
export function pickProfile(profileId: string) {
  useStore.getState().set({ profileId });
  try { localStorage.setItem(PROFILE_KEY, profileId); } catch { /* storage blocked */ }
}
/** Mount once (App), before any shared run hydrates. */
export function loadSavedProfile() {
  try {
    const saved = localStorage.getItem(PROFILE_KEY);
    if (saved && !useStore.getState().runId) useStore.getState().set({ profileId: saved });
  } catch { /* ignore */ }
}
