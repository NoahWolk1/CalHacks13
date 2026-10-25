"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Lock, Check, Loader2, Trash2 } from "lucide-react";
import { useStore } from "@/lib/client/store";
import { deleteAgent, draftAgent, saveAgent } from "@/lib/client/runClient";
import type { AgentConfig } from "@/lib/types";
import { SectionLabel, VehicleGlyph } from "./ui";

function Tag({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <span className={`inline-flex items-center rounded-[3px] border border-line px-1.5 text-[11.5px] leading-[18px] text-fg3 ${className}`}>{children}</span>;
}

function AgentCard({ agent, usedBy, onDelete }: { agent: AgentConfig; usedBy: number; onDelete?: () => void }) {
  return (
    <div className="flex flex-col gap-2.5 bg-panel p-4">
      <div className="flex items-center gap-2.5">
        <VehicleGlyph kind={agent.vehicle} color={agent.color} size={18} />
        <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-fg1">{agent.name}</span>
        {agent.needsKeys?.length ? (
          <span className="text-[12px] text-fg4" title={`Sits out of plans until ${agent.needsKeys.join(" + ")} is set`}>Needs key</span>
        ) : null}
        <span className="text-[12px] text-fg3">{agent.builtin ? "Built-in" : "Custom"}</span>
      </div>
      <p className="text-[12.5px] leading-relaxed text-fg2">{agent.description}</p>
      {agent.dataSources.length > 0 && (
        <ul className="space-y-0.5 text-[12px] text-fg3">
          {agent.dataSources.map((d) => <li key={d} className="truncate" title={d}>{d}</li>)}
        </ul>
      )}
      <div className="mt-auto flex flex-wrap items-center gap-1 pt-1">
        <Tag>{agent.coverage}</Tag>
        <Tag className="capitalize">{agent.vehicle}</Tag>
        {agent.tools.map((t) => <Tag key={t} className="num">{t}</Tag>)}
        <span className="ml-auto text-[12px] text-fg4">
          {usedBy > 0 ? `In ${usedBy} orchestrator${usedBy > 1 ? "s" : ""}` : agent.createdBy ? `By ${agent.createdBy}` : ""}
        </span>
        {onDelete && (
          <button onClick={onDelete} title="Delete from library" aria-label={`Delete ${agent.name}`}
            className="rounded-[4px] p-1 text-fg4 transition-colors hover:bg-raised hover:text-risk">
            <Trash2 size={12} strokeWidth={1.5} />
          </button>
        )}
      </div>
    </div>
  );
}

const FIELD = "w-full rounded-md border border-line bg-bg px-2.5 py-2 text-[12.5px] text-fg1 placeholder:text-fg4 focus:border-line-strong focus:outline-none";

function CreateCard() {
  const llm = useStore((s) => s.llm);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<AgentConfig | null>(null);
  const [reuse, setReuse] = useState<AgentConfig | null>(null);

  const reset = () => { setDraft(null); setReuse(null); setError(null); };
  const run = (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    fn().catch((e: Error) => setError(e.message)).finally(() => setBusy(false));
  };
  const generate = () => run(async () => {
    reset();
    const r = await draftAgent(prompt);
    if (r.kind === "reuse") setReuse(r.agent); else setDraft(r.agent);
  });
  const save = () => run(async () => {
    await saveAgent(draft!);
    reset();
    setPrompt("");
  });

  return (
    <div className={`flex flex-col gap-2.5 bg-panel p-4 ${draft || reuse ? "sm:col-span-2" : ""}`}>
      <div>
        <div className="text-[13.5px] font-medium text-fg1">Create an agent</div>
        <div className="text-[12px] text-fg3">Describe a data source; get a worker.</div>
      </div>

      {!draft && (
        <>
          <textarea disabled={!llm || busy} rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && prompt.trim()) generate(); }}
            placeholder={'e.g. "Health inspection scores for restaurants in SF" or "Scrape the listings at <url> and pin each address"'}
            className={`${FIELD} resize-none disabled:cursor-not-allowed`} />
          <button disabled={!llm || busy || !prompt.trim()} onClick={generate}
            className="flex h-8 items-center justify-center gap-1.5 rounded-md border border-line-strong text-[12.5px] text-fg1 transition-colors hover:bg-raised disabled:cursor-not-allowed disabled:border-line disabled:text-fg4 disabled:hover:bg-transparent">
            {busy ? <Loader2 size={12} className="animate-spin" /> : !llm && <Lock size={12} strokeWidth={1.5} />}
            {busy ? "Designing agent…" : "Generate agent"}
          </button>
          {!llm && <p className="text-[12px] leading-snug text-fg4">Creating agents needs <code className="num text-fg3">ANTHROPIC_API_KEY</code>.</p>}
        </>
      )}

      {reuse && (
        <div className="space-y-2">
          <p className="text-[12px] text-fg3">Your library already has an agent for this, so no new one was created:</p>
          <div className="overflow-hidden rounded-md border border-line"><AgentCard agent={reuse} usedBy={0} /></div>
          <button onClick={reset} className="text-[12px] text-fg3 underline-offset-2 hover:text-fg1 hover:underline">Describe something else</button>
        </div>
      )}

      {draft && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="block space-y-1">
              <span className="text-[12px] text-fg3">Name</span>
              <input value={draft.name} maxLength={40} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className={FIELD} />
            </label>
            <label className="block space-y-1">
              <span className="text-[12px] text-fg3">Brief (what the agent is told to do)</span>
              <textarea rows={7} value={draft.prompt} onChange={(e) => setDraft({ ...draft, prompt: e.target.value })} className={`${FIELD} resize-y`} />
            </label>
            <div className="flex gap-1.5">
              <button disabled={busy || !draft.name.trim() || !draft.prompt?.trim()} onClick={save}
                className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md border border-line-strong text-[12.5px] text-fg1 transition-colors hover:bg-raised disabled:opacity-50">
                {busy ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} strokeWidth={1.5} />} Save to library
              </button>
              <button disabled={busy} onClick={reset} className="h-8 rounded-md border border-line px-3 text-[12.5px] text-fg2 transition-colors hover:bg-raised">Discard</button>
            </div>
          </div>
          <div className="overflow-hidden rounded-md border border-line"><AgentCard agent={draft} usedBy={0} /></div>
        </div>
      )}

      {error && <p className="text-[12px] leading-snug text-risk">{error}</p>}
    </div>
  );
}

export default function AgentHub() {
  const { hubOpen, agents, profiles, set } = useStore();
  const close = () => set({ hubOpen: false });

  useEffect(() => {
    if (!hubOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") set({ hubOpen: false }); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hubOpen, set]);

  const usage = (id: string) => profiles.filter((p) => p.defaultAgents.includes(id)).length;
  const library = agents.filter((a) => !a.temporary);

  return (
    <AnimatePresence>
      {hubOpen && (
        <motion.div key="hub" className="pointer-events-auto fixed inset-0 z-50 grid place-items-center bg-black/60 p-6 max-lg:p-3 max-lg:pt-[var(--safe-top)]"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.14 }} onMouseDown={close}>
          <motion.div role="dialog" aria-modal="true" aria-label="Agent hub"
            className="flex max-h-[86vh] w-full max-w-[1080px] flex-col overflow-hidden rounded-lg border border-line-strong bg-panel shadow-[0_24px_64px_rgba(0,0,0,0.5)]"
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }} transition={{ duration: 0.16, ease: "easeOut" }}
            onMouseDown={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3 border-b border-line px-5 py-4">
              <div className="flex-1">
                <h2 className="text-[16px] font-semibold tracking-[-0.01em] text-fg1">Agent hub</h2>
                <p className="text-[12.5px] text-fg3">Workers are reusable building blocks. Orchestrators combine them into a survey team.</p>
              </div>
              <button onClick={close} className="rounded-[4px] p-1.5 text-fg3 transition-colors hover:bg-raised hover:text-fg1" aria-label="Close"><X size={16} strokeWidth={1.5} /></button>
            </div>

            <div className="scroll-thin min-h-0 flex-1 space-y-6 overflow-y-auto p-5">
              <section>
                <SectionLabel right={<span className="num text-[11.5px]">{profiles.length}</span>}>Orchestrators</SectionLabel>
                <div className="grid gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
                  {profiles.map((p) => {
                    const team = p.defaultAgents.map((id) => agents.find((a) => a.id === id)).filter((a): a is AgentConfig => !!a);
                    return (
                      <div key={p.id} className="bg-panel p-4">
                        <div className="text-[13.5px] font-medium text-fg1">{p.name}</div>
                        <p className="mt-0.5 text-[12.5px] text-fg3">{p.tagline}</p>
                        <div className="mt-3 flex flex-wrap items-center gap-2.5">
                          {team.map((a) => (
                            <span key={a.id} title={a.needsKeys?.length ? `${a.name} (needs key)` : a.name} className={a.needsKeys?.length ? "opacity-35" : undefined}>
                              <VehicleGlyph kind={a.vehicle} color={a.color} size={15} />
                            </span>
                          ))}
                          {!team.length && <span className="text-[12px] text-fg4">No workers assigned</span>}
                          <span className="num ml-auto text-[11.5px] text-fg3">{team.filter((a) => !a.needsKeys?.length).length}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              <section>
                <SectionLabel right={<span className="num text-[11.5px]">{library.length}</span>}>Worker library</SectionLabel>
                <div className="grid gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
                  <CreateCard />
                  {library.map((a) => (
                    <AgentCard key={a.id} agent={a} usedBy={usage(a.id)}
                      onDelete={a.builtin ? undefined : () => { if (confirm(`Delete "${a.name}" from the library?`)) deleteAgent(a.id).catch((e: Error) => alert(e.message)); }} />
                  ))}
                </div>
              </section>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
