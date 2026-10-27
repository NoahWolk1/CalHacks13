"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion, type Variants } from "framer-motion";
import { ArrowLeft, Lock, Check, Loader2, Trash2, ChevronDown } from "lucide-react";
import { useStore } from "@/lib/client/store";
import { deleteAgent, draftAgent, saveAgent } from "@/lib/client/runClient";
import type { AgentConfig } from "@/lib/types";
import type { AdvancedSpec } from "@/lib/agents/factory";
import { APP_NAME } from "@/lib/brand";
import { SKY_AGENTS } from "@/lib/sky/agents";
import { SectionLabel, VehicleGlyph } from "./ui";
import { SwarmMark } from "./TopBar";

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

const TOOL_OPTIONS = [
  { id: "search", label: "Web search" },
  { id: "scrape", label: "Read web pages" },
  { id: "http_get", label: "Call JSON APIs" },
] as const;
const VEHICLE_OPTIONS = ["drone", "car", "rover", "satellite", "boat"] as const;
const SWATCHES = ["#e879f9", "#c084fc", "#fb923c", "#facc15", "#a3e635", "#2dd4bf", "#60a5fa", "#f87171"];

/** Form state for the advanced fields; sources are one per line until sent. */
type AdvancedForm = Omit<AdvancedSpec, "dataSources"> & { sources: string };
const EMPTY_ADVANCED: AdvancedForm = { sources: "", tools: [] };

function toSpec({ sources, ...f }: AdvancedForm): AdvancedSpec | undefined {
  const spec: AdvancedSpec = {
    ...f,
    name: f.name?.trim() || undefined,
    coverage: f.coverage?.trim() || undefined,
    criteria: f.criteria?.trim() || undefined,
    output: f.output?.trim() || undefined,
    notes: f.notes?.trim() || undefined,
    dataSources: sources.split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 8),
  };
  const any = spec.name || spec.coverage || spec.criteria || spec.output || spec.notes || spec.vehicle || spec.color
    || spec.forceNew || spec.tools?.length || spec.dataSources?.length;
  return any ? spec : undefined;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="flex items-baseline gap-2 text-[12px] text-fg3">{label}{hint && <span className="text-fg4">{hint}</span>}</span>
      {children}
    </label>
  );
}

function Chip({ on, onClick, children, title }: { on: boolean; onClick: () => void; children: React.ReactNode; title?: string }) {
  return (
    <button type="button" onClick={onClick} title={title} aria-pressed={on}
      className={`flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-[12px] transition-colors ${on ? "border-line-strong bg-raised text-fg1" : "border-line text-fg3 hover:text-fg1"}`}>
      {children}
    </button>
  );
}

/** Optional detail for the generator: sources to use, filters, output shape, and look. */
function AdvancedFields({ value, onChange, disabled }: { value: AdvancedForm; onChange: (v: AdvancedForm) => void; disabled: boolean }) {
  const set = (patch: Partial<AdvancedForm>) => onChange({ ...value, ...patch });
  const tools = value.tools ?? [];
  const toggleTool = (t: (typeof TOOL_OPTIONS)[number]["id"]) => set({ tools: tools.includes(t) ? tools.filter((x) => x !== t) : [...tools, t] });
  return (
    <fieldset disabled={disabled} className="grid gap-3 border-t border-line pt-3 sm:grid-cols-2">
      <Field label="Name" hint="optional">
        <input value={value.name ?? ""} maxLength={40} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Permit Hawk" className={FIELD} />
      </Field>
      <Field label="Coverage" hint="where it works">
        <input value={value.coverage ?? ""} maxLength={80} onChange={(e) => set({ coverage: e.target.value })} placeholder="e.g. Oakland, California, US, Global" className={FIELD} />
      </Field>
      <Field label="Sources to use" hint="one per line: URLs, API endpoints or dataset names">
        <textarea rows={4} value={value.sources} onChange={(e) => set({ sources: e.target.value })}
          placeholder={"https://data.sfgov.org/resource/pyih-qa8i.json\nDataSF Restaurant Scores"} className={`${FIELD} num resize-y`} />
      </Field>
      <Field label="What counts as notable" hint="filters, thresholds, what to skip">
        <textarea rows={4} value={value.criteria ?? ""} maxLength={1000} onChange={(e) => set({ criteria: e.target.value })}
          placeholder="e.g. Only inspections from the last 12 months with a score under 70. Skip closed businesses." className={`${FIELD} resize-y`} />
      </Field>
      <Field label="Each finding should report" hint="fields, units, dates">
        <textarea rows={3} value={value.output ?? ""} maxLength={1000} onChange={(e) => set({ output: e.target.value })}
          placeholder="e.g. Business name, address, score, inspection date, top violation" className={`${FIELD} resize-y`} />
      </Field>
      <Field label="Other instructions" hint="anything else the agent should know">
        <textarea rows={3} value={value.notes ?? ""} maxLength={1000} onChange={(e) => set({ notes: e.target.value })}
          placeholder="e.g. The API pages at 1000 rows; filter by zip code rather than lat/lng." className={`${FIELD} resize-y`} />
      </Field>

      <div className="space-y-1.5">
        <span className="flex items-baseline gap-2 text-[12px] text-fg3">Tools <span className="text-fg4">none picked = agent decides</span></span>
        <div className="flex flex-wrap gap-1.5">
          {TOOL_OPTIONS.map((t) => <Chip key={t.id} on={tools.includes(t.id)} onClick={() => toggleTool(t.id)}>{t.label}</Chip>)}
        </div>
      </div>
      <div className="space-y-1.5">
        <span className="text-[12px] text-fg3">Vehicle</span>
        <div className="flex flex-wrap gap-1.5">
          <Chip on={!value.vehicle} onClick={() => set({ vehicle: undefined })}>Auto</Chip>
          {VEHICLE_OPTIONS.map((v) => (
            <Chip key={v} on={value.vehicle === v} onClick={() => set({ vehicle: v })} title={v}>
              <VehicleGlyph kind={v} color={value.color ?? "currentColor"} size={14} /><span className="capitalize">{v}</span>
            </Chip>
          ))}
        </div>
      </div>
      <div className="space-y-1.5">
        <span className="text-[12px] text-fg3">Color</span>
        <div className="flex flex-wrap items-center gap-1.5">
          <Chip on={!value.color} onClick={() => set({ color: undefined })}>Auto</Chip>
          {SWATCHES.map((c) => (
            <button key={c} type="button" onClick={() => set({ color: c })} aria-label={`Color ${c}`} aria-pressed={value.color === c}
              className={`size-6 rounded-full border-2 transition-transform hover:scale-110 ${value.color === c ? "border-fg1" : "border-transparent"}`}
              style={{ background: c }} />
          ))}
        </div>
      </div>
      <label className="flex items-center gap-2 self-end text-[12.5px] text-fg2">
        <input type="checkbox" checked={!!value.forceNew} onChange={(e) => set({ forceNew: e.target.checked })} className="accent-current" />
        Always create a new agent (skip the library check)
      </label>
    </fieldset>
  );
}

function CreateCard() {
  const llm = useStore((s) => s.llm);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<AgentConfig | null>(null);
  const [reuse, setReuse] = useState<AgentConfig | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [advanced, setAdvanced] = useState<AdvancedForm>(EMPTY_ADVANCED);
  const spec = toSpec(advanced);

  const reset = () => { setDraft(null); setReuse(null); setError(null); };
  const run = (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    fn().catch((e: Error) => setError(e.message)).finally(() => setBusy(false));
  };
  const generate = () => run(async () => {
    reset();
    const r = await draftAgent(prompt, spec);
    if (r.kind === "reuse") setReuse(r.agent); else setDraft(r.agent);
  });
  const save = () => run(async () => {
    await saveAgent(draft!);
    reset();
    setPrompt("");
    setAdvanced(EMPTY_ADVANCED);
  });

  return (
    <div className="flex flex-col gap-2.5 rounded-md border border-line bg-panel p-4">

      {!draft && (
        <>
          <textarea disabled={!llm || busy} rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && prompt.trim()) generate(); }}
            placeholder={'Describe a data source, e.g. "Health inspection scores for restaurants in SF" or "Scrape the listings at <url> and pin each address"'}
            className={`${FIELD} resize-none disabled:cursor-not-allowed`} />
          {showAdvanced && <AdvancedFields value={advanced} onChange={setAdvanced} disabled={!llm || busy} />}
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setShowAdvanced((v) => !v)} aria-expanded={showAdvanced}
              className="flex h-8 items-center gap-1 rounded-md px-2 text-[12.5px] text-fg3 transition-colors hover:text-fg1">
              <ChevronDown size={13} strokeWidth={1.5} className={`transition-transform ${showAdvanced ? "rotate-180" : ""}`} />
              {showAdvanced ? "Hide advanced options" : "Advanced options"}
              {!showAdvanced && toSpec(advanced) && <span className="ml-1 size-1.5 rounded-full bg-fg2" title="Advanced options set" />}
            </button>
            <div className="flex-1" />
            <button disabled={!llm || busy || !prompt.trim()} onClick={generate}
              className="flex h-8 items-center px-4 justify-center gap-1.5 rounded-md border border-line-strong text-[12.5px] text-fg1 transition-colors hover:bg-raised disabled:cursor-not-allowed disabled:border-line disabled:text-fg4 disabled:hover:bg-transparent">
              {busy ? <Loader2 size={12} className="animate-spin" /> : !llm && <Lock size={12} strokeWidth={1.5} />}
              {busy ? "Designing agent…" : "Generate agent"}
            </button>
          </div>
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

const EASE = [0.22, 1, 0.36, 1] as const;

/** Full-page agent library: create workers, browse the library, see which orchestrators use them. */
export default function AgentsPage() {
  const { agents, profiles, runId } = useStore();
  const router = useRouter();
  const still = useReducedMotion();
  // Back to the map, keeping a shared/live mission in the URL.
  const back = runId ? `/?run=${encodeURIComponent(runId)}` : "/";
  // The map stays mounted underneath, so fading this page in/out crossfades with it.
  // Leaving plays the fade first, then navigates.
  const [leaving, setLeaving] = useState(false);
  const leave = () => setLeaving(true);
  const onBackClick = (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; // let new-tab clicks through
    e.preventDefault();
    leave();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (e.key === "Escape" && tag !== "INPUT" && tag !== "TEXTAREA") setLeaving(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const page: Variants = {
    hidden: { opacity: 0 },
    in: { opacity: 1, transition: { duration: 0.22, ease: "easeOut" } },
    out: { opacity: 0, transition: { duration: 0.18, ease: "easeIn" } },
  };
  // Sections rise in one after another once the page starts fading in.
  const stagger: Variants = { in: { transition: { delayChildren: 0.06, staggerChildren: still ? 0 : 0.06 } } };
  const rise: Variants = {
    hidden: { opacity: 0, y: still ? 0 : 14 },
    in: { opacity: 1, y: 0, transition: { duration: 0.32, ease: EASE } },
  };

  const usage = (id: string) => profiles.filter((p) => p.defaultAgents.includes(id)).length;
  const library = agents.filter((a) => !a.temporary);

  return (
    <motion.div className="scroll-thin fixed inset-0 z-50 overflow-y-auto bg-bg"
      variants={page} initial="hidden" animate={leaving ? "out" : "in"}
      onAnimationComplete={(def) => { if (def === "out") router.push(back); }}>
      <header className="dock sticky top-0 z-10 box-content flex h-12 items-center gap-3 border-b border-line px-4" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <Link href={back} onClick={onBackClick} className="flex items-center gap-2.5" aria-label={`${APP_NAME} home`}>
          <SwarmMark />
          <span className="text-[14px] font-semibold tracking-[-0.01em] text-fg1">{APP_NAME}</span>
        </Link>
        <div className="flex-1" />
        <Link href={back} onClick={onBackClick}
          className="flex h-[30px] items-center gap-1.5 rounded-md border border-line-strong px-3 text-[12.5px] text-fg1 transition-colors hover:bg-raised">
          <ArrowLeft size={13} strokeWidth={1.5} /> Back to map
        </Link>
      </header>

      <motion.div variants={stagger} className="mx-auto max-w-[1080px] space-y-8 px-5 py-8 max-lg:px-4 max-lg:py-6">
        <motion.div variants={rise}>
          <h1 className="text-[20px] font-semibold tracking-[-0.015em] text-fg1">Agents</h1>
          <p className="mt-1 text-[13px] text-fg3">Workers are reusable building blocks. Orchestrators combine them into a survey team.</p>
        </motion.div>

        <motion.section variants={rise}>
          <SectionLabel>Create a worker</SectionLabel>
          <CreateCard />
        </motion.section>

        <motion.section variants={rise}>
          <SectionLabel right={<span className="num text-[11.5px]">{library.length}</span>}>Worker library</SectionLabel>
          <div className="grid gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
            {library.map((a) => (
              <AgentCard key={a.id} agent={a} usedBy={usage(a.id)}
                onDelete={a.builtin ? undefined : () => { if (confirm(`Delete "${a.name}" from the library?`)) deleteAgent(a.id).catch((e: Error) => alert(e.message)); }} />
            ))}
          </div>
        </motion.section>

        <motion.section variants={rise}>
          <SectionLabel right={<Link href="/space" className="text-[12px] text-fg3 hover:text-fg1">Open Space research</Link>}>Space team</SectionLabel>
          <div className="grid gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
            {SKY_AGENTS.map((a) => (
              <div key={a.id} className="flex flex-col gap-2.5 bg-panel p-4">
                <div className="flex items-center gap-2.5">
                  <VehicleGlyph kind="satellite" color={a.color} size={18} />
                  <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-fg1">{a.name}</span>
                  <span className="text-[12px] text-fg3">Space</span>
                </div>
                <p className="text-[12.5px] leading-relaxed text-fg2">{a.description}</p>
                <a href={a.sourceUrl} target="_blank" rel="noreferrer" className="truncate text-[12px] text-fg3 hover:text-fg1" title={a.sourceUrl}>{a.source}</a>
                <div className="mt-auto flex items-center pt-1">
                  <Tag>Celestial cone</Tag>
                  <Link href="/space" className="ml-auto text-[12px] text-fg4 hover:text-fg1">Runs on /space</Link>
                </div>
              </div>
            ))}
          </div>
        </motion.section>

        <motion.section variants={rise}>
          <SectionLabel right={<span className="num text-[11.5px]">{profiles.length}</span>}>Orchestrators</SectionLabel>
          <div className="grid gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-2 xl:grid-cols-4">
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
        </motion.section>
      </motion.div>
    </motion.div>
  );
}
