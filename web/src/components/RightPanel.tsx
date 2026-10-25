"use client";

import { Fragment, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ExternalLink, Check, Trash2 } from "lucide-react";
import { KIND_COLORS } from "@/lib/client/theme";
import { useStore, agentById } from "@/lib/client/store";
import { decideSpawned } from "@/lib/client/runClient";
import type { Finding, Insight } from "@/lib/types";
import { useLayout, dragPanel, GUTTER } from "@/lib/client/layout";
import { StatusPill, VehicleGlyph } from "./ui";
import Sash from "./Sash";

const KIND: Record<Insight["kind"], { label: string; color: string }> = {
  risk: { label: "Risk", color: KIND_COLORS.risk },
  opportunity: { label: "Opportunity", color: KIND_COLORS.opportunity },
  conflict: { label: "Conflict", color: KIND_COLORS.conflict },
  note: { label: "Signal", color: KIND_COLORS.note },
};

export type RightTab = "agents" | "insights" | "answer" | "findings";

/** Tab list (with live counts) shared by the desktop panel and the mobile sheet. */
export function useRightTabs() {
  const { insights, findingOrder, answer, mode, plan, agentState } = useStore();
  return [
    { id: "agents", label: "Agents", n: Object.keys(agentState).length || plan.length },
    { id: "insights", label: "Insights", n: insights.length },
    ...(mode === "ask" || answer ? [{ id: "answer", label: "Answer", n: 0 }] : []),
    { id: "findings", label: "Findings", n: findingOrder.length },
  ] as { id: RightTab; label: string; n: number }[];
}

export function RightTabBody({ tab }: { tab: RightTab }) {
  return (
    <>
      {tab === "agents" && <AgentsTab />}
      {tab === "insights" && <InsightsTab />}
      {tab === "answer" && <AnswerTab />}
      {tab === "findings" && <FindingsTab />}
    </>
  );
}

export default function RightPanel() {
  const { rightTab, set } = useStore();
  const tabs = useRightTabs();

  const open = useLayout((s) => s.rightOpen);
  const dragging = useLayout((s) => s.dragging === "right");

  return (
    <motion.aside initial={false} inert={!open && !dragging} aria-hidden={!open}
      animate={open ? { x: 0, opacity: 1, visibility: "visible" } : { x: "100%", opacity: 0, ...(dragging ? {} : { transitionEnd: { visibility: "hidden" as const } }) }}
      transition={{ type: "spring", stiffness: 420, damping: 40 }}
      style={{ width: "var(--gs-rw)" }}
      className="dock pointer-events-auto absolute bottom-0 right-0 top-12 z-20 flex flex-col border-l border-line max-lg:hidden">
      <div role="tablist" className="flex shrink-0 gap-5 overflow-hidden border-b border-line px-4">
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={rightTab === t.id} onClick={() => set({ rightTab: t.id })}
            className={`relative flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap text-[13px] transition-colors ${rightTab === t.id ? "text-fg1" : "text-fg3 hover:text-fg2"}`}>
            {t.label}{t.n ? <span className="num text-[11.5px] text-fg3">{t.n}</span> : null}
            {rightTab === t.id && <motion.span layoutId="tab" transition={{ duration: 0.16, ease: "easeOut" }} className="absolute inset-x-0 -bottom-px h-[1.5px] bg-fg1" />}
          </button>
        ))}
      </div>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        <RightTabBody tab={rightTab} />
      </div>
      <Sash axis="x" id="right" label="Resize results panel" className="inset-y-0 -left-[4px]"
        onMove={(x) => dragPanel("right", window.innerWidth - GUTTER - x)} onReset={() => useLayout.getState().set({ rightWidth: null })} />
    </motion.aside>
  );
}

function AgentsTab() {
  const { agentState, agents, running } = useStore();
  const ids = Object.keys(agentState);
  if (!ids.length) {
    return (
      <div className="py-2">
        <p className="px-4 pb-2 pt-1 text-[12.5px] text-fg3">Fleet on standby. The orchestrator picks from these agents.</p>
        {agents.filter((a) => !a.temporary).map((a) => (
          <div key={a.id} className="grid grid-cols-[18px_1fr_auto] items-center gap-x-2.5 px-4 py-2">
            <VehicleGlyph kind={a.vehicle} color={a.color} size={16} />
            <span className="truncate text-[13px] text-fg1">{a.name}</span>
            <span className="text-[12px] text-fg4" title={a.needsKeys?.length ? `Needs ${a.needsKeys.join(" + ")}` : undefined}>{a.needsKeys?.length ? "Needs key" : a.coverage}</span>
            <span className="col-start-2 col-end-4 truncate text-[12px] text-fg3">{a.dataSources.join(" · ")}</span>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="py-1.5">
      {ids.map((id) => {
        const a = agentById(id);
        const st = agentState[id];
        if (!a) return null;
        const last = st.status === "error" ? st.detail : st.logs[st.logs.length - 1];
        return (
          <motion.div key={id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.16 }}
            className="grid grid-cols-[18px_1fr_auto] items-center gap-x-2.5 border-b border-line/60 px-4 py-2.5 last:border-b-0">
            <VehicleGlyph kind={a.vehicle} color={a.color} size={16} />
            <span className="truncate text-[13px] font-medium text-fg1">{a.name}</span>
            <span className="flex items-center gap-3">
              <StatusPill status={st.status} />
              <span className="num w-7 text-right text-[12px] text-fg2">{st.findings || "–"}</span>
            </span>
            {st.spawnedBy && <span className="col-start-2 col-end-4 text-[12px] text-fg3">Created by {agentById(st.spawnedBy)?.name ?? st.spawnedBy}</span>}
            {st.spawnedBy && !running && <KeepOrDiscard id={id} decision={st.decision} />}
            {st.redispatched && st.focus && <span className="col-start-2 col-end-4 truncate text-[12px] text-fg2">Re-dispatched: {st.focus}</span>}
            {last && <span className={`col-start-2 col-end-4 truncate text-[12px] ${st.status === "error" ? "text-risk" : "text-fg3"}`} title={last}>{last}</span>}
          </motion.div>
        );
      })}
      {!running && <p className="px-4 pb-2 pt-3 text-[12px] text-fg4">Mission complete. Hover an insight to see which findings it connects.</p>}
    </div>
  );
}

function Severity({ value, color }: { value: number; color: string }) {
  return (
    <span className="ml-auto flex items-center gap-[2px]" title={`Severity ${value.toFixed(2)}`}>
      {[0.2, 0.4, 0.6, 0.8, 1].map((v) => <span key={v} className="h-2.5 w-[3px] rounded-[0.5px]" style={{ background: value >= v - 0.1 ? color : "var(--line-strong)" }} />)}
      <span className="num ml-1.5 text-[11px] text-fg3">{value.toFixed(2)}</span>
    </span>
  );
}

function KeepOrDiscard({ id, decision }: { id: string; decision?: "kept" | "discarded" }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (decision) {
    return (
      <span className={`col-start-2 col-end-4 flex items-center gap-1.5 text-[12px] ${decision === "kept" ? "text-ok" : "text-fg4"}`}>
        {decision === "kept" ? <><Check size={12} strokeWidth={1.5} /> Saved to your library</> : <><Trash2 size={12} strokeWidth={1.5} /> Discarded</>}
      </span>
    );
  }
  const decide = (keep: boolean) => {
    setBusy(true);
    setError(null);
    decideSpawned(id, keep).catch((e: Error) => setError(e.message)).finally(() => setBusy(false));
  };
  return (
    <span className="col-start-2 col-end-4 mt-1 space-y-1">
      <span className="flex gap-1.5">
        <button disabled={busy} onClick={() => decide(true)}
          className="flex h-7 flex-1 items-center justify-center gap-1 rounded-md border border-line-strong text-[12px] text-fg1 transition-colors hover:bg-raised disabled:opacity-50">
          <Check size={12} strokeWidth={1.5} /> Keep in library
        </button>
        <button disabled={busy} onClick={() => decide(false)}
          className="flex h-7 flex-1 items-center justify-center gap-1 rounded-md border border-line text-[12px] text-fg2 transition-colors hover:bg-raised disabled:opacity-50">
          <Trash2 size={12} strokeWidth={1.5} /> Discard
        </button>
      </span>
      {error && <span className="block text-[12px] text-risk">{error}</span>}
    </span>
  );
}

function InsightsTab() {
  const { insights, set, selectedInsight, running } = useStore();
  if (!insights.length) return <Empty text={running ? "Agents are still in the field. Insights appear once the orchestrator cross-references their findings." : "No insights yet. Deploy agents to an area."} />;
  return (
    <div>
      {insights.map((ins, i) => {
        const k = KIND[ins.kind];
        const on = selectedInsight === ins.id;
        return (
          <motion.button key={ins.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.16, delay: Math.min(i, 6) * 0.03 }}
            onMouseEnter={() => set({ hoveredInsight: ins.id })} onMouseLeave={() => set({ hoveredInsight: null })}
            onClick={() => set({ selectedInsight: on ? null : ins.id })} aria-pressed={on}
            className={`block w-full border-b border-line px-4 py-3.5 text-left transition-colors ${on ? "bg-raised shadow-[inset_2px_0_0_var(--fg1)]" : "hover:bg-raised/50"}`}>
            <div className="flex items-center gap-2 text-[12px] font-medium" style={{ color: k.color }}>
              <span className="h-[7px] w-[7px] rounded-[1.5px]" style={{ background: k.color }} />
              {k.label}
              <Severity value={ins.severity} color={k.color} />
            </div>
            <div className="mt-1.5 text-[14px] font-medium leading-snug tracking-[-0.005em] text-fg1">{ins.title}</div>
            <div className="mt-1 text-[12.5px] leading-relaxed text-fg2">{ins.body}</div>
            <SourceChips ids={ins.findingIds} />
          </motion.button>
        );
      })}
    </div>
  );
}

function SourceChips({ ids }: { ids: string[] }) {
  const findings = useStore((s) => s.findings);
  const byAgent = useMemo(() => {
    const m = new Map<string, number>();
    ids.forEach((id) => { const f = findings[id]; if (f) m.set(f.worker_id, (m.get(f.worker_id) ?? 0) + 1); });
    return [...m];
  }, [ids, findings]);
  return (
    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-fg3">
      {byAgent.map(([wid, n]) => {
        const a = agentById(wid);
        return a ? (
          <span key={wid} className="inline-flex items-center gap-1.5">
            <VehicleGlyph kind={a.vehicle} color={a.color} size={12} />{a.name}<span className="num text-[11.5px] text-fg2">{n}</span>
          </span>
        ) : null;
      })}
    </div>
  );
}

function AnswerTab() {
  const { answer, running, question } = useStore();
  if (!answer) return <Empty text={running ? "The orchestrator answers once the agents report back." : "Switch to Ask mode and deploy to get an answer."} />;
  return (
    <div className="p-4">
      {question && <div className="mb-3 border-l-2 border-line-strong pl-3 text-[12.5px] text-fg3">{question}</div>}
      <Markdown text={answer} streaming={running} />
    </div>
  );
}

function FindingsTab() {
  const { findingOrder, findings, revealed, selectedFinding, set } = useStore();
  const groups = useMemo(() => {
    const m = new Map<string, Finding[]>();
    for (const id of findingOrder) { const f = findings[id]; if (!m.has(f.worker_id)) m.set(f.worker_id, []); m.get(f.worker_id)!.push(f); }
    return [...m];
  }, [findingOrder, findings]);
  if (!groups.length) return <Empty text="Findings stream in here as agents report them." />;
  return (
    <div className="pb-3">
      {groups.map(([wid, list]) => {
        const a = agentById(wid);
        return (
          <div key={wid}>
            <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-line bg-panel px-4 py-2 text-[12.5px] font-medium text-fg1">
              {a && <VehicleGlyph kind={a.vehicle} color={a.color} size={13} />}{a?.name ?? wid}<span className="num ml-auto text-[11.5px] font-normal text-fg3">{list.length}</span>
            </div>
            <div className="py-1">
              {list.map((f) => (
                <div key={f.id} onClick={() => set({ selectedFinding: f.id })}
                  className={`group cursor-pointer px-4 py-1.5 transition-colors ${selectedFinding === f.id ? "bg-raised shadow-[inset_2px_0_0_var(--fg1)]" : "hover:bg-raised/50"} ${revealed[f.id] ? "" : "opacity-40"}`}>
                  <div className="flex items-start gap-2.5 text-[12.5px]">
                    <span className="num mt-px w-8 shrink-0 text-[11px] text-fg4">{f.id}</span>
                    <span className="flex-1 text-fg1">{f.claim}</span>
                    {f.source_url && <a href={f.source_url} target="_blank" rel="noreferrer" aria-label="Open source" onClick={(e) => e.stopPropagation()} className="mt-0.5 text-fg4 hover:text-fg1"><ExternalLink size={12} strokeWidth={1.5} /></a>}
                  </div>
                  <div className="mt-0.5 pl-[42px] text-[11.5px] text-fg3">
                    {f.source_type}{f.observed_at ? ` · ${f.observed_at.slice(0, 10)}` : ""} · <span className="num">{Math.round(f.confidence * 100)}%</span> conf.{f.props?.areaLevel ? " · area-wide" : ""}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="grid h-full place-items-center px-8 text-center">
      <p className="max-w-[260px] text-[12.5px] leading-relaxed text-fg3">{text}</p>
    </div>
  );
}

/** Minimal markdown: paragraphs, "- " and "1. " lists, **bold**, _italic_ / *italic*, and [F12] citations → clickable chips. */
const BULLET = /^\s*[-*] /;
const NUMBERED = /^\s*\d+[.)] /;
function Markdown({ text, streaming }: { text: string; streaming?: boolean }) {
  const set = useStore((s) => s.set);
  const findings = useStore((s) => s.findings);
  const inline = (s: string) =>
    s.split(/(\*\*[^*]+\*\*|\[F\d+(?:,\s*F\d+)*\]|(?<![\w*])\*[^*\s][^*]*?\*(?![\w*])|(?<!\w)_[^_\s][^_]*?_(?!\w))/g).map((part, i) => {
      if (!part) return null;
      if (part.startsWith("**") && part.endsWith("**") && part.length > 4) return <strong key={i} className="font-semibold text-fg1">{part.slice(2, -2)}</strong>;
      if ((part.startsWith("*") && part.endsWith("*") || part.startsWith("_") && part.endsWith("_")) && part.length > 2) return <em key={i} className="italic text-fg1">{part.slice(1, -1)}</em>;
      const cites = part.match(/^\[(F\d+(?:,\s*F\d+)*)\]$/);
      if (cites) return cites[1].split(/,\s*/).map((id) => {
        const a = findings[id] && agentById(findings[id].worker_id);
        return (
          <button key={id + i} onClick={() => set({ selectedFinding: id })}
            className="num mx-0.5 inline-flex items-center gap-1 rounded-[3px] border border-line px-1 align-[1px] text-[10.5px] text-fg2 transition-colors hover:border-line-strong hover:text-fg1">
            <span className="h-1.5 w-1.5 rounded-[1px]" style={{ background: a?.color ?? "var(--fg3)" }} />{id}
          </button>
        );
      });
      return <Fragment key={i}>{part}</Fragment>;
    });
  const blocks = text.split(/\n{2,}/);
  return (
    <div className={`space-y-2.5 text-[13px] leading-relaxed text-fg2 ${streaming ? "caret" : ""}`}>
      {blocks.map((b, i) => {
        const lines = b.split("\n").filter((l) => l.trim());
        if (lines.length && lines.every((l) => BULLET.test(l))) return <ul key={i} className="space-y-1.5">{lines.map((l, j) => <li key={j} className="flex gap-2.5"><span className="mt-[9px] h-[3px] w-[3px] shrink-0 rounded-full bg-fg3" /><span>{inline(l.replace(BULLET, ""))}</span></li>)}</ul>;
        if (lines.length && lines.every((l) => NUMBERED.test(l))) return <ol key={i} className="space-y-1.5">{lines.map((l, j) => <li key={j} className="flex gap-2"><span className="num w-4 shrink-0 text-right text-[12px] text-fg3">{l.match(/\d+/)![0]}.</span><span>{inline(l.replace(NUMBERED, ""))}</span></li>)}</ol>;
        if (/^#+ /.test(b)) return <h4 key={i} className="text-[13.5px] font-semibold text-fg1">{inline(b.replace(/^#+ /, ""))}</h4>;
        return <p key={i}>{lines.map((l, j) => <Fragment key={j}>{j > 0 && <br />}{BULLET.test(l) ? <>· {inline(l.replace(BULLET, ""))}</> : NUMBERED.test(l) ? <>{l.match(/\d+/)![0]}. {inline(l.replace(NUMBERED, ""))}</> : inline(l)}</Fragment>)}</p>;
      })}
    </div>
  );
}
