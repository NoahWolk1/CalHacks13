"use client";
// Mission bar (Convex mode only): share the live mission link and reopen recent missions.
// Anyone opening a shared link watches the same mission stream in real time.
import { useEffect, useRef, useState } from "react";
import { useQuery } from "convex/react";
import { History, Share2, Check, ChevronDown } from "lucide-react";
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
    <div ref={ref} className="pointer-events-auto absolute right-[416px] top-[76px] z-20 flex items-start gap-2 max-lg:left-4 max-lg:right-auto max-lg:top-[calc(var(--safe-top)_+_52px)]">
      <div className="glass flex items-center gap-1 rounded-full p-1 text-xs">
        <button onClick={() => setOpen((o) => !o)}
          className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.18em] transition ${open ? "bg-white/[0.07] text-white" : "text-slate-400 hover:text-white"}`}>
          <History size={12} className="text-teal-300" /> Missions <ChevronDown size={11} className={`transition ${open ? "rotate-180" : ""}`} />
        </button>
        {runId && (
          <button onClick={share} title="Copy a live link to this mission"
            className="flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-teal-300 transition hover:bg-teal-300/10">
            {copied ? <><Check size={12} /> Copied</> : <><Share2 size={12} /> Share</>}
          </button>
        )}
        {watching && (
          <span className="flex items-center gap-1.5 px-2 font-mono text-[10px] uppercase tracking-[0.18em] text-slate-400">
            <span className={`h-1.5 w-1.5 rounded-full ${live ? "animate-pulse bg-rose-400" : running ? "animate-pulse bg-teal-300" : "bg-slate-500"}`} />
            {live ? "Watching live" : running ? "Replaying" : "Replay"}
          </span>
        )}
      </div>

      {open && (
        <div className="glass absolute right-0 top-full mt-2 w-[320px] overflow-hidden rounded-xl p-1.5 max-lg:left-0 max-lg:right-auto max-lg:w-[calc(100vw-32px)]">
          <div className="px-2 pb-1.5 pt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">Recent missions · synced via Convex</div>
          {recent === undefined && <div className="px-2 py-2 text-xs text-slate-500">Loading…</div>}
          {recent?.length === 0 && <div className="px-2 py-2 text-xs text-slate-500">No missions yet. Deploy one.</div>}
          <div className="scroll-thin max-h-[320px] overflow-y-auto">
            {recent?.map((r) => {
              const on = r._id === runId;
              const profile = profiles.find((p) => p.id === r.profileId);
              return (
                <button key={r._id} onClick={() => { openRun(r._id); setOpen(false); }}
                  className={`w-full rounded-lg px-2 py-1.5 text-left transition ${on ? "bg-teal-300/10" : "hover:bg-white/[0.04]"}`}>
                  <div className="flex items-center gap-2">
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${r.status === "running" ? "animate-pulse bg-rose-400" : r.status === "error" ? "bg-amber-400" : "bg-emerald-400"}`} />
                    <span className={`truncate text-xs ${on ? "text-white" : "text-slate-200"}`}>{r.label ?? "Unnamed area"}</span>
                    <span className="ml-auto shrink-0 font-mono text-[10px] text-slate-500">{ago(r.startedAt)}</span>
                  </div>
                  <div className="mt-0.5 truncate pl-3.5 text-[11px] text-slate-500">
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
