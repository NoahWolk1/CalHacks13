"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Lock } from "lucide-react";
import { useStore } from "@/lib/client/store";
import type { AgentConfig } from "@/lib/types";
import { SectionLabel, VehicleGlyph } from "./ui";

function Tag({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <span className={`inline-flex items-center rounded-[3px] border border-line px-1.5 text-[11.5px] leading-[18px] text-fg3 ${className}`}>{children}</span>;
}

function AgentCard({ agent, usedBy }: { agent: AgentConfig; usedBy: number }) {
  return (
    <div className="flex flex-col gap-2.5 bg-panel p-4">
      <div className="flex items-center gap-2.5">
        <VehicleGlyph kind={agent.vehicle} color={agent.color} size={18} />
        <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-fg1">{agent.name}</span>
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
      </div>
    </div>
  );
}

function CreateCard() {
  return (
    <div className="flex flex-col gap-2.5 bg-panel p-4">
      <div>
        <div className="text-[13.5px] font-medium text-fg1">Create an agent</div>
        <div className="text-[12px] text-fg3">Describe a data source; get a worker.</div>
      </div>
      <textarea disabled rows={3}
        placeholder={'e.g. "Scrape the listings at <url> and pin each address"'}
        className="w-full cursor-not-allowed resize-none rounded-md border border-line bg-bg px-2.5 py-2 text-[12.5px] text-fg1 placeholder:text-fg4" />
      <button disabled className="flex h-8 items-center justify-center gap-1.5 rounded-md border border-line text-[12.5px] text-fg4 disabled:cursor-not-allowed">
        <Lock size={12} strokeWidth={1.5} /> Generate agent
      </button>
      <p className="text-[12px] leading-snug text-fg4">
        Prompt-to-create is being built by a teammate. See <code className="num text-fg3">src/lib/agents/factory.ts</code>
      </p>
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
                          {team.map((a) => <span key={a.id} title={a.name}><VehicleGlyph kind={a.vehicle} color={a.color} size={15} /></span>)}
                          {!team.length && <span className="text-[12px] text-fg4">No workers assigned</span>}
                          <span className="num ml-auto text-[11.5px] text-fg3">{team.length}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              <section>
                <SectionLabel right={<span className="num text-[11.5px]">{agents.length}</span>}>Worker library</SectionLabel>
                <div className="grid gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
                  <CreateCard />
                  {agents.map((a) => <AgentCard key={a.id} agent={a} usedBy={usage(a.id)} />)}
                </div>
              </section>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
