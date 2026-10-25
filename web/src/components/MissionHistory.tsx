"use client";
// Mission bar (Convex mode only): share the live mission link and reopen recent missions.
// Anyone opening a shared link watches the same mission stream in real time.
import { useEffect, useRef, useState } from "react";
import { useQuery } from "convex/react";
import { History, Check, ChevronDown } from "lucide-react";
import { api } from "../../convex/_generated/api";
import { useStore } from "@/lib/client/store";
import { isOwnRun, openRun } from "@/lib/client/runClient";

function ago(t: number) {
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

export default function MissionHistory() {
  const runId = useStore((s) => s.runId);
  const running = useStore((s) => s.running);
  const profiles = useStore((s) => s.profiles);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const recent = useQuery(api.runs.recent, { limit: 10 });
  const live = recent?.find((r) => r._id === runId)?.status === "running";
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  const share = async () => {
    if (!runId) return;
    const url = `${window.location.origin}/?run=${runId}`;
    try { await navigator.clipboard.writeText(url); } catch { window.prompt("Mission link", url); }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const watching = !!runId && !isOwnRun(runId);

  return (
    <div ref={ref} className="gs-follow pointer-events-auto absolute right-[calc(var(--gs-re)+12px)] top-[60px] z-20 flex items-start gap-2 max-lg:right-4 max-lg:top-[calc(var(--safe-top)_+_54px)]">
      <div className="glass flex h-[30px] items-stretch rounded-md text-[12.5px]">
        <button onClick={() => setOpen((o) => !o)}
          className={`flex items-center gap-1.5 rounded-l-md px-2.5 transition-colors ${open ? "bg-raised text-fg1" : "text-fg2 hover:text-fg1"}`}>
          <History size={13} strokeWidth={1.5} /> Missions <ChevronDown size={12} strokeWidth={1.5} className={`text-fg3 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
        {runId && (
          <button onClick={share} title="Copy a live link to this mission"
            className="flex items-center gap-1.5 border-l border-line px-2.5 text-fg2 transition-colors hover:text-fg1">
            {copied ? <><Check size={13} strokeWidth={1.5} /> Copied</> : <>Share link</>}
          </button>
        )}
        {watching && (
          <span className="flex items-center gap-1.5 border-l border-line px-2.5 text-fg3">
            <span className={`h-1.5 w-1.5 rounded-full ${live ? "bg-accent" : running ? "bg-fg2" : "bg-fg4"}`} />
            {live ? "Watching live" : running ? "Replaying" : "Replay"}
          </span>
        )}
      </div>

      {open && (
        <div className="glass absolute right-0 top-full mt-2 w-[320px] overflow-hidden rounded-lg p-1 max-lg:right-0 max-lg:w-[calc(100vw-32px)]">
          <div className="px-2 pb-1.5 pt-1.5 text-[12px] text-fg3">Recent missions, synced via Convex</div>
          {recent === undefined && <div className="px-2 py-2 text-[12.5px] text-fg3">Loading…</div>}
          {recent?.length === 0 && <div className="px-2 py-2 text-[12.5px] text-fg3">No missions yet. Deploy one.</div>}
          <div className="scroll-thin max-h-[320px] overflow-y-auto">
            {recent?.map((r) => {
              const on = r._id === runId;
              const profile = profiles.find((p) => p.id === r.profileId);
              return (
                <button key={r._id} onClick={() => { openRun(r._id); setOpen(false); }}
                  className={`w-full rounded-[4px] px-2 py-1.5 text-left transition-colors ${on ? "bg-active" : "hover:bg-raised"}`}>
                  <div className="flex items-center gap-2">
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${r.status === "running" ? "bg-accent" : r.status === "error" ? "bg-risk" : "bg-fg4"}`} />
                    <span className="truncate text-[13px] text-fg1">{r.label ?? "Unnamed area"}</span>
                    <span className="num ml-auto shrink-0 text-[11.5px] text-fg3">{ago(r.startedAt)}</span>
                  </div>
                  <div className="mt-0.5 truncate pl-3.5 text-[12px] text-fg3">
                    {profile?.name ?? r.profileId} · {r.mode === "ask" && r.question ? `“${r.question}”` : "Insights"} · {r.findingCount ?? 0} findings
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
