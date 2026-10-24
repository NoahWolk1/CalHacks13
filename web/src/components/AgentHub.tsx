"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Boxes, X, ShieldAlert, Store, Siren, Sparkles, WandSparkles, Lock, Globe, Database, Wrench, User, Bot } from "lucide-react";
import { useStore } from "@/lib/client/store";
import type { AgentConfig } from "@/lib/types";
import { AgentAvatar, SectionLabel } from "./ui";

const ICONS = { ShieldAlert, Store, Siren } as const;

function Chip({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] ${className}`}>{children}</span>;
}

function AgentCard({ agent, usedBy }: { agent: AgentConfig; usedBy: number }) {
  return (
    <div className="group relative flex flex-col gap-2.5 overflow-hidden rounded-xl border border-white/5 bg-white/[0.02] p-3 transition hover:border-white/15 hover:bg-white/[0.035]">
      <span className="pointer-events-none absolute -right-10 -top-10 h-24 w-24 rounded-full opacity-0 blur-2xl transition group-hover:opacity-40" style={{ background: agent.color }} />
      <div className="flex items-start gap-2.5">
        <AgentAvatar agent={agent} size={36} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-medium text-white">{agent.name}</span>
            {agent.builtin ? (
              <Chip className="bg-slate-500/15 font-mono uppercase tracking-wider text-slate-300">Built-in</Chip>
            ) : (
              <Chip className="bg-fuchsia-400/15 font-mono uppercase tracking-wider text-fuchsia-200">Custom</Chip>
            )}
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            <Chip className="bg-sky-400/10 text-sky-200"><Globe size={10} />{agent.coverage}</Chip>
            <Chip className="font-mono capitalize" ><span style={{ color: agent.color }}>{agent.vehicle}</span></Chip>
            {usedBy > 0 && <Chip className="bg-teal-300/10 text-teal-200">in {usedBy} orchestrator{usedBy > 1 ? "s" : ""}</Chip>}
          </div>
        </div>
      </div>
      <p className="text-xs leading-relaxed text-slate-400">{agent.description}</p>
      {agent.dataSources.length > 0 && (
        <div className="space-y-0.5">
          <div className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.18em] text-slate-500"><Database size={10} />Sources</div>
          <ul className="space-y-0.5 text-[11px] text-slate-300">
            {agent.dataSources.map((d) => (
              <li key={d} className="flex gap-1.5"><span className="text-teal-400/70">›</span><span className="min-w-0">{d}</span></li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-auto flex flex-wrap items-center gap-1 pt-1">
        <Wrench size={10} className="text-slate-500" />
        {agent.tools.map((t) => <Chip key={t} className="border border-white/10 font-mono text-slate-300">{t}</Chip>)}
        {agent.createdBy && (
          <span className="ml-auto flex items-center gap-1 font-mono text-[10px] text-slate-500">
            {agent.createdBy === "user" ? <User size={10} /> : <Bot size={10} />}by {agent.createdBy}
          </span>
        )}
      </div>
    </div>
  );
}

function CreateCard() {
  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-dashed border-teal-300/25 bg-teal-300/[0.03] p-3">
      <div className="flex items-center gap-2.5">
        <span className="grid h-9 w-9 place-items-center rounded-lg bg-teal-300/10 ring-1 ring-teal-300/30">
          <WandSparkles size={17} className="text-teal-300" />
        </span>
        <div>
          <div className="text-sm font-medium text-white">Create an agent</div>
          <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-slate-500">prompt → worker</div>
        </div>
      </div>
      <textarea disabled rows={3}
        placeholder={'e.g. "Scrape the listings at <url> and pin each address"'}
        className="w-full cursor-not-allowed resize-none rounded-lg border border-white/10 bg-black/30 px-2.5 py-2 text-xs text-white placeholder:text-slate-500" />
      <button disabled className="flex items-center justify-center gap-1.5 rounded-lg bg-slate-700/60 py-1.5 text-xs font-medium text-slate-400 disabled:cursor-not-allowed">
        <Lock size={12} /> Generate agent
      </button>
      <p className="text-[10.5px] leading-snug text-slate-500">
        Prompt-to-create is being built by a teammate — see <code className="font-mono text-slate-400">src/lib/agents/factory.ts</code>
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
        <motion.div key="hub" className="pointer-events-auto fixed inset-0 z-50 grid place-items-center bg-[#03060c]/70 p-6 backdrop-blur-md"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={close}>
          <motion.div role="dialog" aria-modal="true" aria-label="Agent Hub"
            className="glass flex max-h-[86vh] w-full max-w-[1080px] flex-col overflow-hidden rounded-2xl"
            initial={{ opacity: 0, scale: 0.94, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            onMouseDown={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-start gap-3 border-b border-white/5 px-5 py-4">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-teal-300/10 ring-1 ring-teal-300/30">
                <Boxes size={19} className="text-teal-300" />
              </span>
              <div className="flex-1">
                <h2 className="text-glow text-lg font-semibold text-white">Agent Hub</h2>
                <p className="text-xs text-slate-400">Workers are reusable building blocks. Orchestrators combine them.</p>
              </div>
              <button onClick={close} className="rounded-lg p-1.5 text-slate-500 transition hover:bg-white/5 hover:text-white" aria-label="Close"><X size={16} /></button>
            </div>

            <div className="scroll-thin min-h-0 flex-1 space-y-6 overflow-y-auto p-5">
              {/* Orchestrators */}
              <section>
                <SectionLabel right={<span>{profiles.length}</span>}>Orchestrators</SectionLabel>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {profiles.map((p) => {
                    const Icon = ICONS[p.icon as keyof typeof ICONS] ?? Sparkles;
                    const team = p.defaultAgents.map((id) => agents.find((a) => a.id === id)).filter((a): a is AgentConfig => !!a);
                    return (
                      <div key={p.id} className="rounded-xl border border-white/5 bg-gradient-to-br from-white/[0.04] to-transparent p-3">
                        <div className="flex items-center gap-2">
                          <Icon size={15} className="text-teal-300" />
                          <span className="text-sm font-medium text-white">{p.name}</span>
                        </div>
                        <p className="mt-1 text-xs text-slate-400">{p.tagline}</p>
                        <div className="mt-3 flex items-center justify-between">
                          <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-slate-500">Team · {team.length}</span>
                        </div>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {team.map((a) => (
                            <span key={a.id} title={a.name}><AgentAvatar agent={a} size={28} /></span>
                          ))}
                          {!team.length && <span className="text-[11px] text-slate-600">No workers assigned</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* Worker library */}
              <section>
                <SectionLabel right={<span>{agents.length} workers</span>}>Worker library</SectionLabel>
                <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
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
