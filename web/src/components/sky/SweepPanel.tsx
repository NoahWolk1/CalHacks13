"use client";
// Planet sweep progress: polls GET /api/sky/sweep/:id while its tiles run in the background (it keeps
// going with the tab closed; the link reopens it). Spend against the cap, the tiles, the notebook, and the
// finds of every tile, vetted automatically as they show up: the ones still viable after vetting live at
// the top, best tier first. A tile or a find opens that tile's deep survey.
import { useCallback, useEffect, useRef, useState } from "react";
import { Link2, Square, X } from "lucide-react";
import { isNewFind, type SkyObject, type SweepView } from "@/lib/sky/types";
import { forgetVets } from "@/lib/client/savedVets";
import { TIER_LABEL } from "@/lib/sky/vetShared";
import { FindCard, Notebook } from "./finds";

/** Under a find: its vetting reason, and its watch for new TESS data once the sweep is done (watchlist.ts). */
const findDetail = (o: SkyObject) => [o.props.vetted, o.props.watch].filter(Boolean).map(String).join(" · ") || undefined;

/** A find's vetting state, as sweep.ts puts it on the find (props.vet): best tier first. */
const VET_RANK: Record<string, number> = { A: 0, B: 1, C: 2, vetting: 3, queued: 4, failed: 5, K: 6, X: 7 };
const VIABLE = new Set(["A", "B", "C"]);

const POLL_MS = 8_000;
const usd = (n: number) => (n < 10 ? `$${n.toFixed(2)}` : `$${Math.round(n)}`);

export default function SweepPanel({ id, onSurvey, onClose }: { id: string; onSurvey: (surveyId: string) => void; onClose: () => void }) {
  const [view, setView] = useState<SweepView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const vetsSeen = useRef<Set<string> | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/sky/sweep/${encodeURIComponent(id)}`, { cache: "no-store" });
    const j = await res.json().catch(() => null);
    if (!res.ok) throw new Error(j?.error ?? `${res.status} ${res.statusText}`);
    setView(j as SweepView); setError(null);
    return j as SweepView;
  }, [id]);

  // A find vetted since the last poll: its card loads the saved report again.
  useEffect(() => {
    const vets = view?.sweep.sweep?.vets ?? {};
    const done = Object.keys(vets).filter((k) => vets[k].status === "done");
    if (vetsSeen.current) for (const k of done) if (!vetsSeen.current.has(k)) {
      forgetVets(vets[k].input.tic);
    }
    if (view) vetsSeen.current = new Set(done);
  }, [view]);

  useEffect(() => {
    setView(null); setError(null); vetsSeen.current = null;
    let alive = true, timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      let running = true;
      try { running = (await load()).sweep.status === "running"; } catch (e) { if (alive) setError((e as Error).message); }
      if (alive && running) timer = setTimeout(tick, POLL_MS);
    };
    void tick();
    return () => { alive = false; clearTimeout(timer); };
  }, [load]);

  const stop = async () => { await fetch(`/api/sky/sweep/${encodeURIComponent(id)}/stop`, { method: "POST" }).catch(() => {}); void load().catch(() => {}); };
  const share = async () => {
    try { await navigator.clipboard.writeText(`${location.origin}/space?sweep=${id}`); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked */ }
  };

  const s = view?.sweep, w = s?.sweep;
  const spent = w ? w.claudeUsd + w.reviewUsd + w.computeUsd : 0;
  const tiles = w?.tiles ?? [];
  // A stopped sweep's tiles were stopped with it.
  const tileStatus = (t: (typeof tiles)[number]) => (t.status === "running" && s?.status !== "running" ? "stopped" : t.status);
  const done = tiles.filter((t) => t.status === "done").length;
  const live = tiles.flatMap((t, i) => (tileStatus(t) === "running" ? [{ t, i }] : []));
  // Average spend of a finished tile (compute priced at the server's rate), and what the rest of the budget covers.
  const fnMs = tiles.reduce((k, t) => k + (t.fnMs ?? 0), 0) + (w?.vetMs ?? 0);
  const rate = fnMs && w ? w.computeUsd / fnMs : 0;
  const perTile = done ? tiles.filter((t) => t.status === "done").reduce((k, t) => k + (t.usd ?? 0) + (t.fnMs ?? 0) * rate, 0) / done : 0;
  const more = perTile && w && s?.status === "running" ? Math.floor((w.budgetUsd - spent) / perTile) : 0;
  // Transit finds carry their vetting state (props.vet); the rest (variables, eclipsing binaries) aren't vetted.
  const vetState = (o: SkyObject) => (o.props.vet === undefined ? "" : String(o.props.vet));
  const finds = (view?.objects.filter(isNewFind) ?? []).sort((a, b) => (VET_RANK[vetState(a)] ?? 9) - (VET_RANK[vetState(b)] ?? 9));
  const viable = finds.filter((o) => VIABLE.has(vetState(o)));
  const waiting = finds.filter((o) => ["vetting", "queued"].includes(vetState(o)));
  const dropped = finds.filter((o) => ["K", "X", "failed"].includes(vetState(o)));
  const others = finds.filter((o) => !vetState(o));
  const vetting = waiting.filter((o) => vetState(o) === "vetting").map((o) => o.name);
  const tierCounts = (["A", "B", "C", "K", "X"] as const).map((t) => [t, finds.filter((o) => vetState(o) === t).length] as const).filter(([, n]) => n);
  const byId = new Map<string, SkyObject>((view?.objects ?? []).map((o) => [o.id, o]));
  const openFind = (fid: string) => { const o = byId.get(fid); if (o?.props.survey) onSurvey(String(o.props.survey)); };
  const status = s?.status === "running" ? (live.length || !vetting.length ? "searching" : "vetting") : w?.budgetHit ? "budget reached" : s?.status;

  return (
    <section className="border-b border-line p-4">
      <div className="mb-2 flex items-center gap-2 text-[11.5px] uppercase tracking-[0.06em] text-fg3">
        <span>Planet sweep</span>
        {s && <span className={`rounded px-1.5 py-px text-[10.5px] normal-case tracking-normal ${s.status === "running" ? "bg-[#7fd1b9]/15 text-[#7fd1b9]" : s.status === "done" ? "bg-ok/15 text-ok" : "bg-fg4/15 text-fg3"}`}>{status}</span>}
        <div className="flex-1" />
        <button onClick={share} title="Copy a link to this sweep" className="flex items-center gap-1 normal-case tracking-normal text-fg3 hover:text-fg1"><Link2 size={12} />{copied ? "copied" : "link"}</button>
        {s?.status === "running" && <button onClick={stop} title="Stop the sweep and its running tiles (results so far stay)" className="flex items-center gap-1 normal-case tracking-normal text-fg3 hover:text-risk"><Square size={11} />stop</button>}
        <button onClick={onClose} title="Close (the sweep keeps running)" className="text-fg3 hover:text-fg1"><X size={13} /></button>
      </div>
      {error && <div className="mb-2 text-[12.5px] text-risk">{error}</div>}
      {!s && !error && <div className="caret text-[12.5px] text-fg3">Loading sweep</div>}
      {s && w && (
        <>
          <div className="flex items-baseline justify-between text-[12px]">
            <span className="num text-fg1">{usd(spent)} <span className="text-fg3">of {usd(w.budgetUsd)}</span></span>
            <span className="num text-fg3">Claude {usd(w.claudeUsd + w.reviewUsd)} · compute ~{usd(w.computeUsd)}</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-line">
            <div className="h-full rounded-full bg-accent transition-[width] duration-700" style={{ width: `${Math.min(100, Math.max(1, (spent / w.budgetUsd) * 100))}%` }} />
          </div>
          <div className="num mt-1.5 text-[11.5px] text-fg3">
            {done} of {tiles.length} tiles done · {s.seasonsDone} seasons of {s.stars} stars searched{perTile ? ` · ~${usd(perTile)} per tile, budget left for ~${more} more` : ""}
          </div>
          <div className="mt-0.5 text-[11.5px] text-fg4">r {s.cone.radius}° around RA {s.cone.ra.toFixed(2)}°, Dec {s.cone.dec.toFixed(2)}° · 3° tiles, deepest TESS coverage first · keeps running with this tab closed</div>

          {live.length > 0 && (
            <ul className="mt-2.5 space-y-1">
              {live.map(({ t, i }) => {
                const pct = t.seasons ? Math.round(((t.done ?? 0) / t.seasons) * 100) : 0;
                return (
                  <li key={i}>
                    <button onClick={() => t.surveyId && onSurvey(t.surveyId)} className="flex w-full items-center gap-2 text-left text-[12px] hover:text-fg1">
                      <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-[#7fd1b9]" />
                      <span className="num shrink-0 text-fg2">T{i + 1}</span>
                      <span className="num truncate text-fg3">RA {t.cone.ra.toFixed(1)}° Dec {t.cone.dec.toFixed(1)}°</span>
                      <span className="num ml-auto shrink-0 text-fg3">{t.seasons ? `${pct}% of ${t.stars} stars` : "listing light curves"}{t.finds ? ` · ${t.finds} find${t.finds === 1 ? "" : "s"}` : ""}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {viable.length + waiting.length + dropped.length > 0 && (
            <div className="mt-1.5 text-[11.5px] text-fg3" title={Object.values(TIER_LABEL).join("\n")}>
              Auto-vetting: <span className="num">{viable.length + dropped.length}</span> of {viable.length + waiting.length + dropped.length} transit finds vetted
              {tierCounts.length > 0 && <> · {tierCounts.map(([t, n]) => `${n} tier ${t}`).join(", ")}</>}
              {vetting.length > 0 && <span className="caret"> · vetting {vetting.join(", ")}</span>}
            </div>
          )}

          <div className="mt-3">
            <Notebook notes={view!.notes.slice(-12)} byId={byId} onCite={openFind} label={(n) => (n.agent === "vetting" ? "Vetter" : "Strategist")} />
          </div>

          <div className="mb-2.5">
            <div className="mb-1 text-[11.5px] text-ok">
              {viable.length
                ? <>{viable.length} candidate{viable.length === 1 ? "" : "s"} still viable after vetting, best tier first (A passed every check, B passed with open items, C ambiguous). Candidates for follow-up, not confirmed planets.</>
                : s.status === "running" ? "Nothing has survived vetting yet: candidates appear here as soon as they pass." : "Nothing new survived vetting in the tiles searched."}
            </div>
            {viable.length > 0 && <ul className="space-y-1.5">{viable.map((o) => <FindCard key={o.id} o={o} onCite={openFind} detail={findDetail(o)} />)}</ul>}
          </div>
          {[
            { label: `${waiting.length} waiting for vetting`, list: waiting },
            { label: `${dropped.length} rejected or already known`, list: dropped },
            { label: `${others.length} other new find${others.length === 1 ? "" : "s"} (variable stars, eclipsing binaries: not planets, not vetted)`, list: others },
          ].filter((g) => g.list.length).map((g) => (
            <details key={g.label} className="mb-1.5 text-[12px]">
              <summary className="cursor-pointer text-fg3">{g.label}</summary>
              <ul className="mt-1 space-y-1.5">{g.list.slice(0, 60).map((o) => <FindCard key={o.id} o={o} onCite={openFind} detail={findDetail(o)} />)}</ul>
            </details>
          ))}

          <details className="text-[12px]">
            <summary className="cursor-pointer text-fg3">{tiles.length} tiles, in search order</summary>
            <ul className="scroll-thin mt-1 max-h-[240px] space-y-0.5 overflow-y-auto">
              {tiles.slice(0, 500).map((t, i) => {
                const st = tileStatus(t);
                return (
                  <li key={i}>
                    <button disabled={!t.surveyId} onClick={() => t.surveyId && onSurvey(t.surveyId)} className="flex w-full items-center gap-2 text-left disabled:cursor-default">
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${st === "running" ? "bg-[#7fd1b9]" : st === "done" ? (t.finds ? "bg-[#f2c35b]" : "bg-ok") : st === "pending" ? "bg-line-strong" : st === "error" ? "bg-risk" : "bg-fg4"}`} />
                      <span className="num w-10 shrink-0 text-fg3">T{i + 1}</span>
                      <span className="num truncate text-fg2">RA {t.cone.ra.toFixed(1)}° Dec {t.cone.dec.toFixed(1)}°</span>
                      <span className="num ml-auto shrink-0 text-[11.5px] text-fg3">{st === "pending" ? "" : `${st}${t.stars ? ` · ${t.stars} stars` : ""}${t.finds ? ` · ${t.finds} find${t.finds === 1 ? "" : "s"}` : ""}`}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </details>
        </>
      )}
    </section>
  );
}

