"use client";
// Deep survey progress: polls GET /api/sky/survey/:id while the survey runs in the background (it
// keeps going with the tab closed; the link reopens it), and shows progress, the Strategist's
// notebook, the finds so far and every star's seasons.
import { useCallback, useEffect, useRef, useState } from "react";
import { Link2, Square, X } from "lucide-react";
import { isNewFind, type SkyObject, type SurveyView } from "@/lib/sky/types";
import { FindCard, Notebook, PLAYBOOK } from "./finds";

const POLL_MS = 4_000;

const dur = (ms: number) => {
  const s = Math.round(ms / 1000);
  if (s < 90) return `${s}s`;
  const m = Math.round(s / 60);
  return m < 90 ? `${m} min` : `${(m / 60).toFixed(1)} h`;
};

export default function SurveyPanel({ id, byId, onView, onCite, onClose }: {
  id: string; byId: Map<string, SkyObject>; onView: (v: SurveyView) => void; onCite: (id: string) => void; onClose: () => void;
}) {
  const [view, setView] = useState<SurveyView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const onViewRef = useRef(onView);
  onViewRef.current = onView;

  const load = useCallback(async () => {
    const res = await fetch(`/api/sky/survey/${encodeURIComponent(id)}`, { cache: "no-store" });
    const j = await res.json().catch(() => null);
    if (!res.ok) throw new Error(j?.error ?? `${res.status} ${res.statusText}`);
    setView(j as SurveyView); setError(null);
    onViewRef.current(j as SurveyView);
    return j as SurveyView;
  }, [id]);

  useEffect(() => {
    setView(null); setError(null);
    let alive = true, timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      let running = true;
      try { running = (await load()).survey.status === "running"; } catch (e) { if (alive) setError((e as Error).message); }
      if (alive && running) timer = setTimeout(tick, POLL_MS);
    };
    void tick();
    return () => { alive = false; clearTimeout(timer); };
  }, [load]);

  const stop = async () => { await fetch(`/api/sky/survey/${encodeURIComponent(id)}/stop`, { method: "POST" }).catch(() => {}); void load().catch(() => {}); };
  const share = async () => {
    try { await navigator.clipboard.writeText(`${location.origin}/sky?survey=${id}`); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked */ }
  };

  const s = view?.survey;
  const finished = s ? s.seasonsDone + s.seasonsFailed : 0;
  const pct = s && s.seasons ? Math.round((finished / s.seasons) * 100) : 0;
  const elapsed = s ? (s.finishedAt ?? (s.status === "running" ? Date.now() : s.updatedAt)) - s.createdAt : 0;
  const rate = s && finished ? finished / Math.max(1, s.updatedAt - s.createdAt) : 0;
  const eta = s && s.status === "running" && rate ? (s.seasons - finished) / rate : 0;
  const finds = view?.objects.filter(isNewFind) ?? [];
  const rejected = view?.objects.filter((o) => !isNewFind(o)) ?? [];

  return (
    <section className="border-b border-line p-4">
      <div className="mb-2 flex items-center gap-2 text-[11.5px] uppercase tracking-[0.06em] text-fg3">
        <span>Deep survey</span>
        {s && <span className={`rounded px-1.5 py-px text-[10.5px] normal-case tracking-normal ${s.status === "running" ? "bg-[#7fd1b9]/15 text-[#7fd1b9]" : s.status === "done" ? "bg-ok/15 text-ok" : "bg-fg4/15 text-fg3"}`}>{s.status === "running" ? (s.planned ? "searching" : "planning") : s.status}</span>}
        <div className="flex-1" />
        <button onClick={share} title="Copy a link to this survey" className="flex items-center gap-1 normal-case tracking-normal text-fg3 hover:text-fg1"><Link2 size={12} />{copied ? "copied" : "link"}</button>
        {s?.status === "running" && <button onClick={stop} title="Stop the survey (results so far stay)" className="flex items-center gap-1 normal-case tracking-normal text-fg3 hover:text-risk"><Square size={11} />stop</button>}
        <button onClick={onClose} title="Close (the survey keeps running)" className="text-fg3 hover:text-fg1"><X size={13} /></button>
      </div>
      {error && <div className="mb-2 text-[12.5px] text-risk">{error}</div>}
      {!s && !error && <div className="caret text-[12.5px] text-fg3">Loading survey</div>}
      {s && (
        <>
          <div className="h-1.5 overflow-hidden rounded-full bg-line">
            <div className="h-full rounded-full bg-[#7fd1b9] transition-[width] duration-700" style={{ width: `${s.planned ? Math.max(pct, 1) : 0}%` }} />
          </div>
          <div className="num mt-1.5 text-[11.5px] text-fg3">
            {s.planned
              ? `${finished} of ${s.seasons} seasons (${pct}%) · ${s.lightCurves} light curves · ${s.stars} stars · ${dur(elapsed)}${eta ? ` · ~${dur(eta)} left` : ""}${s.seasonsFailed ? ` · ${s.seasonsFailed} failed` : ""}`
              : `Listing every TESS light curve in the field and ranking ${dur(elapsed)}`}
          </div>
          <div className="mt-0.5 text-[11.5px] text-fg4">r {s.cone.radius}° at RA {s.cone.ra.toFixed(3)}°, Dec {s.cone.dec.toFixed(3)}° · keeps running with this tab closed · {view!.backend === "file" ? "stored on this server's disk" : "stored in SpacetimeDB"}</div>
          {s.note && <div className="mt-1 text-[12.5px] text-fg3">{s.note}</div>}

          <div className="mt-3">
            <Notebook notes={view!.notes.slice(-14)} byId={byId} onCite={onCite}
              label={(n) => (n.agent === "strategist" ? `Strategist${s.plan?.by === "claude" ? " · Claude" : ""}` : n.agent)} />
          </div>

          {finds.length > 0 && (
            <div className="mb-2.5">
              <div className="mb-1 text-[11.5px] text-[#f2c35b]">{finds.length} new find{finds.length === 1 ? "" : "s"} so far: candidates for follow-up, not confirmed discoveries</div>
              <ul className="space-y-1.5">{finds.map((o) => <FindCard key={o.id} o={o} onCite={onCite} />)}</ul>
            </div>
          )}
          {s.planned && !finds.length && <div className="mb-2 text-[12.5px] text-fg3">{s.status === "running" ? "Nothing new has survived vetting yet." : `Nothing new survived vetting in ${s.seasonsDone} seasons of ${s.stars} stars.`}</div>}
          {rejected.length > 0 && (
            <details className="mb-2 text-[12px]">
              <summary className="cursor-pointer text-fg3">{rejected.length} result{rejected.length === 1 ? "" : "s"} explained or rejected</summary>
              <ul className="mt-1 space-y-0.5">
                {rejected.map((o) => (
                  <li key={o.id}><button onClick={() => onCite(o.id)} className="flex w-full gap-2 text-left"><span className="num shrink-0 text-[11px] text-fg4">{o.id}</span><span className="truncate text-fg2">{o.type}</span><span className="num ml-auto shrink-0 text-fg4">TIC {o.props.TIC}</span></button></li>
                ))}
              </ul>
            </details>
          )}
          {view!.stars.length > 0 && (
            <details className="text-[12px]" open={view!.stars.length <= 20}>
              <summary className="cursor-pointer text-fg3">{view!.stars.length} stars, in search order</summary>
              <ul className="mt-1 space-y-0.5">
                {view!.stars.slice(0, 200).map((r) => (
                  <li key={r.tic} className="flex items-center gap-2">
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${r.done + r.failed < r.seasons ? (r.done ? "bg-[#7fd1b9]" : "bg-fg4") : r.signals || r.singles ? "bg-[#f2c35b]" : r.failed === r.seasons ? "bg-risk" : "bg-ok"}`} />
                    <a href={`https://exofop.ipac.caltech.edu/tess/target.php?id=${r.tic}`} target="_blank" rel="noreferrer" className="num shrink-0 text-fg2 hover:text-fg1">TIC {r.tic}</a>
                    <span className="shrink-0 rounded border border-line px-1 text-[10.5px] text-fg3">{PLAYBOOK[r.playbook]}</span>
                    <span className="truncate text-fg4">{r.name.startsWith("TIC ") ? "" : r.name}</span>
                    <span className="num ml-auto shrink-0 text-[11.5px] text-fg3">
                      {r.done}/{r.seasons}{r.signals ? ` · ${r.signals} sig` : ""}{r.singles ? ` · ${r.singles} dip${r.singles === 1 ? "" : "s"}` : ""}{r.variable ? " · var" : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </section>
  );
}
