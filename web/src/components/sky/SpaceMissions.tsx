"use client";
// Mission bar on /space, like the Earth one (MissionHistory.tsx): reopen recent missions and deep
// surveys, share a link to what's on screen, and see whether you're watching a run live or a replay.
import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, History } from "lucide-react";
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
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    fetch("/api/sky/missions", { cache: "no-store" }).then((r) => r.json()).then((j: { missions?: MissionMeta[] }) => setMissions(j.missions ?? [])).catch(() => setMissions([]));
    fetch("/api/sky/survey", { cache: "no-store" }).then((r) => r.json()).then((j: { surveys?: SurveySummary[] }) => setSurveys(j.surveys ?? [])).catch(() => {});
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
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
          <div className="scroll-thin max-h-[300px] overflow-y-auto">
            {missions?.map((m) => (
              <button key={m.id} onClick={() => { onMission(m.id); setOpen(false); }}
                className={`w-full rounded-[4px] px-2 py-1.5 text-left transition-colors ${m.id === missionId ? "bg-active" : "hover:bg-raised"}`}>
                <div className="flex items-center gap-2">
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${DOT[m.status]}`} />
                  <span className="truncate text-[13px] text-fg1">{m.label}</span>
                  <span className="num ml-auto shrink-0 text-[11.5px] text-fg3">{ago(m.createdAt)}</span>
                </div>
                <div className="mt-0.5 truncate pl-3.5 text-[12px] text-fg3">
                  {m.question ? `“${m.question}”` : "Briefing"} · {m.objects ?? 0} results{m.finds ? ` · ${m.finds} new find${m.finds === 1 ? "" : "s"}` : ""}
                </div>
              </button>
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
