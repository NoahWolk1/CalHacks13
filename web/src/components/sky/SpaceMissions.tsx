"use client";
// Mission bar on /space, like the Earth one (MissionHistory.tsx): reopen recent missions and deep
// surveys, share a link to what's on screen, and see whether you're watching a run live or a replay.
// Missions can be renamed and filed under a category, and the list filtered by category.
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, History, Pencil } from "lucide-react";
import { formatDec, formatRa } from "@/lib/sky/geom";
import type { MissionMeta, MissionStatus, SurveySummary } from "@/lib/sky/types";

function ago(t: number) {
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

const DOT: Record<MissionStatus, string> = { running: "animate-pulse bg-accent", done: "bg-ok", stopped: "bg-fg4", error: "bg-risk" };

export default function SpaceMissions({ missionId, surveyId, watching, live, onMission, onSurvey }: {
  missionId: string | null; surveyId: string | null;
  /** Opened from a link (not run in this tab), and whether that mission is still running. */
  watching: boolean; live: boolean;
  onMission: (id: string) => void; onSurvey: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [missions, setMissions] = useState<MissionMeta[] | undefined>();
  const [surveys, setSurveys] = useState<SurveySummary[]>([]);
  /** null = all; "" = uncategorized. */
  const [filter, setFilter] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; name: string; category: string; saving?: boolean; error?: string } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const categories = useMemo(() => [...new Set((missions ?? []).flatMap((m) => (m.category ? [m.category] : [])))].sort((a, b) => a.localeCompare(b)), [missions]);
  const shown = (missions ?? []).filter((m) => filter === null || (m.category ?? "") === filter);

  const save = async () => {
    if (!editing) return;
    setEditing({ ...editing, saving: true, error: undefined });
    try {
      const r = await fetch(`/api/sky/missions/${editing.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: editing.name, category: editing.category }) });
      const j = (await r.json()) as { mission?: MissionMeta; error?: string };
      if (!r.ok || !j.mission) throw new Error(j.error ?? `HTTP ${r.status}`);
      setMissions((ms) => ms?.map((m) => (m.id === j.mission!.id ? j.mission! : m)));
      setEditing(null);
    } catch (e) {
      setEditing((x) => x && { ...x, saving: false, error: (e as Error).message.slice(0, 100) });
    }
  };

  useEffect(() => {
    if (!open) return;
    fetch("/api/sky/missions", { cache: "no-store" }).then((r) => r.json()).then((j: { missions?: MissionMeta[] }) => setMissions(j.missions ?? [])).catch(() => setMissions([]));
    fetch("/api/sky/survey", { cache: "no-store" }).then((r) => r.json()).then((j: { surveys?: SurveySummary[] }) => setSurveys(j.surveys ?? [])).catch(() => {});
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) { setOpen(false); setEditing(null); } };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  const link = missionId ? `/space?mission=${missionId}` : surveyId ? `/space?survey=${surveyId}` : null;
  const share = async () => {
    if (!link) return;
    const url = `${window.location.origin}${link}`;
    try { await navigator.clipboard.writeText(url); } catch { window.prompt("Mission link", url); }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div ref={ref} className="relative">
      <div className="flex h-[30px] items-stretch rounded-md border border-line text-[12.5px]">
        <button onClick={() => setOpen((o) => !o)}
          className={`flex items-center gap-1.5 rounded-l-md px-2.5 transition-colors ${open ? "bg-raised text-fg1" : "text-fg2 hover:text-fg1"} ${link || watching ? "" : "rounded-r-md"}`}>
          <History size={13} strokeWidth={1.5} /> <span className="max-sm:hidden">Missions</span> <ChevronDown size={12} strokeWidth={1.5} className={`text-fg3 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
        {link && (
          <button onClick={share} title={missionId ? "Copy a link to this mission: it follows the run live, or replays it once done" : "Copy a link to this deep survey"}
            className="flex items-center gap-1.5 border-l border-line px-2.5 text-fg2 transition-colors hover:text-fg1">
            {copied ? <><Check size={13} strokeWidth={1.5} /> Copied</> : <>Share link</>}
          </button>
        )}
        {watching && (
          <span className="flex items-center gap-1.5 border-l border-line px-2.5 text-fg3 max-sm:hidden">
            <span className={`h-1.5 w-1.5 rounded-full ${live ? "animate-pulse bg-accent" : "bg-fg4"}`} />
            {live ? "Watching live" : "Replay"}
          </span>
        )}
      </div>

      {open && (
        <div className="surface absolute right-0 top-full z-30 mt-2 w-[340px] overflow-hidden rounded-lg border border-line p-1 shadow-lg max-sm:w-[calc(100vw-32px)]">
          <div className="px-2 pb-1.5 pt-1.5 text-[12px] text-fg3">Recent missions: open one to replay it, or follow it live</div>
          {missions === undefined && <div className="px-2 py-2 text-[12.5px] text-fg3">Loading…</div>}
          {missions?.length === 0 && <div className="px-2 py-2 text-[12.5px] text-fg3">No missions yet. Pick a region and press Research.</div>}
          {categories.length > 0 && (
            <div className="flex flex-wrap gap-1 px-2 pb-1.5">
              {[{ k: null, label: "All" }, ...categories.map((c) => ({ k: c, label: c })), { k: "", label: "Uncategorized" }].map(({ k, label }) => (
                <button key={label + String(k)} onClick={() => setFilter(k)} aria-pressed={filter === k}
                  className={`rounded-[4px] border px-1.5 py-0.5 text-[11.5px] transition-colors ${filter === k ? "border-line-strong bg-active text-fg1" : "border-line text-fg3 hover:text-fg1"}`}>
                  {label}
                </button>
              ))}
            </div>
          )}
          <datalist id="space-mission-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
          <div className="scroll-thin max-h-[300px] overflow-y-auto">
            {missions && missions.length > 0 && shown.length === 0 && <div className="px-2 py-2 text-[12.5px] text-fg3">No missions in this category.</div>}
            {shown.map((m) => editing?.id === m.id ? (
              <form key={m.id} ref={(el) => el?.scrollIntoView({ block: "nearest" })} onSubmit={(e) => { e.preventDefault(); void save(); }} onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); setEditing(null); } }}
                className="space-y-1.5 rounded-[4px] bg-raised px-2 py-2">
                <input autoFocus value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} maxLength={80} placeholder={m.label} aria-label="Mission name"
                  className="w-full rounded-[4px] border border-line bg-bg px-2 py-1 text-[13px] text-fg1 outline-none focus:border-line-strong" />
                <input value={editing.category} onChange={(e) => setEditing({ ...editing, category: e.target.value })} maxLength={32} list="space-mission-categories" placeholder="Category (e.g. Exoplanets, Demo)" aria-label="Category"
                  className="w-full rounded-[4px] border border-line bg-bg px-2 py-1 text-[12.5px] text-fg1 outline-none focus:border-line-strong" />
                <div className="flex items-center gap-1.5">
                  <span className="min-w-0 flex-1 truncate text-[11.5px] text-risk">{editing.error}</span>
                  <button type="button" onClick={() => setEditing(null)} className="rounded-[4px] px-2 py-0.5 text-[12px] text-fg3 hover:text-fg1">Cancel</button>
                  <button type="submit" disabled={editing.saving} className="rounded-[4px] border border-line-strong px-2 py-0.5 text-[12px] text-fg1 disabled:opacity-50">{editing.saving ? "Saving…" : "Save"}</button>
                </div>
              </form>
            ) : (
              <div key={m.id} className={`group relative rounded-[4px] transition-colors ${m.id === missionId ? "bg-active" : "hover:bg-raised"}`}>
                <button onClick={() => { onMission(m.id); setOpen(false); }} className="w-full px-2 py-1.5 pr-8 text-left">
                  <div className="flex items-center gap-2">
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${DOT[m.status]}`} />
                    <span className="truncate text-[13px] text-fg1">{m.name || m.label}</span>
                    {m.category && <span className="shrink-0 rounded-[3px] border border-line px-1 text-[10.5px] text-fg3">{m.category}</span>}
                    <span className="num ml-auto shrink-0 text-[11.5px] text-fg3">{ago(m.createdAt)}</span>
                  </div>
                  <div className="mt-0.5 truncate pl-3.5 text-[12px] text-fg3">
                    {m.name ? `${m.label} · ` : ""}{m.question ? `“${m.question}”` : "Briefing"} · {m.objects ?? 0} results{m.finds ? ` · ${m.finds} new find${m.finds === 1 ? "" : "s"}` : ""}
                  </div>
                </button>
                <button onClick={() => setEditing({ id: m.id, name: m.name ?? "", category: m.category ?? "" })} title="Rename or categorize" aria-label={`Rename or categorize ${m.name || m.label}`}
                  className="absolute right-1.5 top-1.5 rounded-[4px] p-1 text-fg3 opacity-0 transition-opacity hover:text-fg1 focus:opacity-100 group-hover:opacity-100 max-sm:opacity-100">
                  <Pencil size={12} strokeWidth={1.5} />
                </button>
              </div>
            ))}
            {surveys.length > 0 && <div className="px-2 pb-1 pt-2.5 text-[11.5px] uppercase tracking-[0.06em] text-fg3">Deep surveys</div>}
            {surveys.slice(0, 8).map((r) => (
              <button key={r.id} onClick={() => { onSurvey(r.id); setOpen(false); }}
                className={`flex w-full items-center gap-2 rounded-[4px] px-2 py-1.5 text-left text-[12px] transition-colors ${r.id === surveyId ? "bg-active" : "hover:bg-raised"}`}>
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${DOT[r.status]}`} />
                <span className="num text-fg2">{formatRa(r.cone.ra)} {formatDec(r.cone.dec)} · r {r.cone.radius}°</span>
                <span className="num ml-auto shrink-0 text-fg3">{r.seasons ? `${Math.round(((r.seasonsDone + r.seasonsFailed) / r.seasons) * 100)}%` : r.status}{r.finds ? ` · ${r.finds} find${r.finds === 1 ? "" : "s"}` : ""}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
