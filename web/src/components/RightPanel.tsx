"use client";

import { Fragment, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, TrendingUp, GitCompare, Info, RotateCw, ExternalLink, Radio } from "lucide-react";
import { useStore, agentById } from "@/lib/client/store";
import type { Finding, Insight } from "@/lib/types";
import { AgentAvatar, StatusPill } from "./ui";

const KIND: Record<Insight["kind"], { icon: typeof Info; label: string; color: string }> = {
  risk: { icon: AlertTriangle, label: "Risk", color: "#fb7185" },
  opportunity: { icon: TrendingUp, label: "Opportunity", color: "#34d399" },
  conflict: { icon: GitCompare, label: "Conflict", color: "#fbbf24" },
  note: { icon: Info, label: "Signal", color: "#38bdf8" },
};

export default function RightPanel() {
  const { rightTab, set, insights, findingOrder, answer, mode, plan, agentState } = useStore();
  const tabs = [
    { id: "agents", label: "Agents", n: Object.keys(agentState).length || plan.length },
    { id: "insights", label: "Insights", n: insights.length },
    ...(mode === "ask" || answer ? [{ id: "answer", label: "Answer", n: 0 }] : []),
    { id: "findings", label: "Findings", n: findingOrder.length },
  ] as { id: "agents" | "insights" | "answer" | "findings"; label: string; n: number }[];

  return (
    <aside className="glass pointer-events-auto absolute bottom-4 right-4 top-[76px] z-20 flex w-[400px] flex-col overflow-hidden rounded-2xl">
      <div className="flex gap-1 border-b border-white/5 p-1.5">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => set({ rightTab: t.id })}
            className={`relative flex-1 rounded-lg px-2 py-1.5 text-xs transition ${rightTab === t.id ? "text-white" : "text-slate-400 hover:text-slate-200"}`}>
            {rightTab === t.id && <motion.span layoutId="tab" className="absolute inset-0 rounded-lg bg-white/[0.07]" />}
            <span className="relative">{t.label}{t.n ? <span className="ml-1.5 font-mono text-[10px] text-teal-300">{t.n}</span> : null}</span>
          </button>
        ))}
      </div>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-3">
        {rightTab === "agents" && <AgentsTab />}
        {rightTab === "insights" && <InsightsTab />}
        {rightTab === "answer" && <AnswerTab />}
        {rightTab === "findings" && <FindingsTab />}
      </div>
    </aside>
  );
}

function AgentsTab() {
  const { agentState, agents, running } = useStore();
  const ids = Object.keys(agentState);
  if (!ids.length) {
    return (
      <div className="space-y-2">
        <p className="px-1 pb-1 text-xs text-slate-500">Fleet on standby. The orchestrator will pick from these agents.</p>
        {agents.map((a) => (
          <div key={a.id} className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.015] p-2.5 opacity-70">
            <AgentAvatar agent={a} size={30} />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium text-slate-200">{a.name}</div>
              <div className="truncate text-[11px] text-slate-500">{a.dataSources.join(" · ")}</div>
            </div>
            <StatusPill status="idle" />
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <AnimatePresence initial={false}>
        {ids.map((id) => {
          const a = agentById(id);
          const st = agentState[id];
          if (!a) return null;
          const live = st.status === "deploying" || st.status === "scanning";
          return (
            <motion.div key={id} layout initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
              className="relative overflow-hidden rounded-xl border bg-white/[0.02] p-3" style={{ borderColor: live ? `${a.color}55` : "rgba(255,255,255,0.06)" }}>
              {live && <span className="shimmer absolute inset-y-0 left-0 w-1/2" style={{ background: `linear-gradient(90deg, transparent, ${a.color}14, transparent)` }} />}
              <div className="relative flex items-center gap-3">
                <AgentAvatar agent={a} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white">{a.name}</span>
                    {st.findings > 0 && <span className="rounded-md px-1.5 font-mono text-[10px]" style={{ color: a.color, background: `${a.color}1a` }}>{st.findings}</span>}
                  </div>
                  <div className="truncate text-[11px] text-slate-500">{a.description}</div>
                </div>
                <StatusPill status={st.status} />
              </div>
              {st.spawnedBy && <div className="relative mt-2 text-[11px] text-amber-300">✦ created by {agentById(st.spawnedBy)?.name ?? st.spawnedBy}</div>}
              {st.redispatched && st.focus && (
                <div className="relative mt-2 flex items-center gap-1.5 rounded-md bg-violet-400/10 px-2 py-1 text-[11px] text-violet-200"><RotateCw size={11} /> Re-dispatched: {st.focus}</div>
              )}
              {(st.logs.length > 0 || st.detail) && (
                <div className="relative mt-2 rounded-md bg-black/30 px-2 py-1.5 font-mono text-[10.5px] leading-relaxed text-slate-400">
                  {st.logs.slice(-2).map((l, i) => <div key={i} className="truncate">› {l}</div>)}
                  {st.status === "error" && <div className="truncate text-rose-300">✕ {st.detail}</div>}
                </div>
              )}
            </motion.div>
          );
        })}
      </AnimatePresence>
      {!running && <p className="px-1 pt-1 text-[11px] text-slate-600">Mission complete. Hover insights to see which findings they connect.</p>}
    </div>
  );
}

function InsightsTab() {
  const { insights, set, selectedInsight, running } = useStore();
  if (!insights.length) return <Empty text={running ? "Agents are still in the field. Insights appear once the orchestrator cross-references their findings." : "No insights yet. Deploy agents to an area."} />;
  return (
    <div className="space-y-2.5">
      {insights.map((ins, i) => {
        const k = KIND[ins.kind];
        const on = selectedInsight === ins.id;
        return (
          <motion.button key={ins.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
            onMouseEnter={() => set({ hoveredInsight: ins.id })} onMouseLeave={() => set({ hoveredInsight: null })}
            onClick={() => set({ selectedInsight: on ? null : ins.id })}
            className={`block w-full rounded-xl border p-3 text-left transition ${on ? "bg-white/[0.06]" : "bg-white/[0.02] hover:bg-white/[0.04]"}`}
            style={{ borderColor: on ? `${k.color}88` : `${k.color}33` }}>
            <div className="mb-1.5 flex items-center gap-2">
              <k.icon size={13} style={{ color: k.color }} />
              <span className="font-mono text-[10px] uppercase tracking-wider" style={{ color: k.color }}>{k.label}</span>
              <span className="ml-auto h-1 w-14 overflow-hidden rounded-full bg-white/10"><span className="block h-full rounded-full" style={{ width: `${ins.severity * 100}%`, background: k.color }} /></span>
            </div>
            <div className="text-sm font-medium leading-snug text-white">{ins.title}</div>
            <div className="mt-1 text-xs leading-relaxed text-slate-400">{ins.body}</div>
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
    <div className="mt-2 flex flex-wrap gap-1">
      {byAgent.map(([wid, n]) => {
        const a = agentById(wid);
        return a ? <span key={wid} className="rounded-md px-1.5 py-0.5 text-[10px]" style={{ color: a.color, background: `${a.color}14` }}>{a.name} ×{n}</span> : null;
      })}
    </div>
  );
}

function AnswerTab() {
  const { answer, running, question } = useStore();
  if (!answer) return <Empty text={running ? "The orchestrator will answer once the agents report back…" : "Switch to Ask mode and deploy to get an answer."} />;
  return (
    <div>
      {question && <div className="mb-3 rounded-lg bg-white/[0.03] px-3 py-2 text-xs italic text-slate-400">“{question}”</div>}
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
    <div className="space-y-4">
      {groups.map(([wid, list]) => {
        const a = agentById(wid);
        return (
          <div key={wid}>
            <div className="mb-1.5 flex items-center gap-2 px-1 text-xs" style={{ color: a?.color }}>
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: a?.color }} />{a?.name}<span className="font-mono text-[10px] text-slate-500">{list.length}</span>
            </div>
            <div className="space-y-1">
              {list.map((f) => (
                <div key={f.id} onClick={() => set({ selectedFinding: f.id })}
                  className={`group cursor-pointer rounded-lg border px-2.5 py-1.5 text-xs transition ${selectedFinding === f.id ? "border-white/30 bg-white/[0.06]" : "border-transparent hover:bg-white/[0.03]"} ${revealed[f.id] ? "" : "opacity-40"}`}>
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 font-mono text-[10px] text-slate-500">{f.id}</span>
                    <span className="flex-1 text-slate-200">{f.claim}</span>
                    {f.source_url && <a href={f.source_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-slate-600 hover:text-teal-300"><ExternalLink size={11} /></a>}
                  </div>
                  <div className="mt-0.5 pl-7 font-mono text-[10px] text-slate-600">
                    {f.source_type}{f.observed_at ? ` · ${f.observed_at}` : ""} · conf {Math.round(f.confidence * 100)}%{f.props?.areaLevel ? " · area-wide" : ""}
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
    <div className="grid h-full place-items-center px-6 text-center">
      <div><Radio className="mx-auto mb-3 text-slate-700" size={28} /><p className="text-xs text-slate-500">{text}</p></div>
    </div>
  );
}

/** Minimal markdown: paragraphs, "- " bullets, **bold**, and [F12] citations → clickable chips. */
function Markdown({ text, streaming }: { text: string; streaming?: boolean }) {
  const set = useStore((s) => s.set);
  const findings = useStore((s) => s.findings);
  const inline = (s: string) =>
    s.split(/(\*\*[^*]+\*\*|\[F\d+(?:,\s*F\d+)*\])/g).map((part, i) => {
      if (part.startsWith("**")) return <strong key={i} className="font-semibold text-white">{part.slice(2, -2)}</strong>;
      const cites = part.match(/^\[(F\d+(?:,\s*F\d+)*)\]$/);
      if (cites) return cites[1].split(/,\s*/).map((id) => {
        const a = findings[id] && agentById(findings[id].worker_id);
        return <button key={id + i} onClick={() => set({ selectedFinding: id })} className="mx-0.5 rounded px-1 align-[1px] font-mono text-[10px]" style={{ color: a?.color ?? "#94a3b8", background: `${a?.color ?? "#94a3b8"}1c` }}>{id}</button>;
      });
      return <Fragment key={i}>{part}</Fragment>;
    });
  const blocks = text.split(/\n{2,}/);
  return (
    <div className={`space-y-2.5 text-[13px] leading-relaxed text-slate-300 ${streaming ? "caret" : ""}`}>
      {blocks.map((b, i) => {
        const lines = b.split("\n");
        if (lines.every((l) => /^\s*[-*] /.test(l))) return <ul key={i} className="space-y-1.5">{lines.map((l, j) => <li key={j} className="flex gap-2"><span className="text-teal-400">▸</span><span>{inline(l.replace(/^\s*[-*] /, ""))}</span></li>)}</ul>;
        if (/^#+ /.test(b)) return <h4 key={i} className="text-sm font-semibold text-white">{inline(b.replace(/^#+ /, ""))}</h4>;
        return <p key={i}>{lines.map((l, j) => <Fragment key={j}>{j > 0 && <br />}{/^\s*[-*] /.test(l) ? <>▸ {inline(l.replace(/^\s*[-*] /, ""))}</> : inline(l)}</Fragment>)}</p>;
      })}
    </div>
  );
}
