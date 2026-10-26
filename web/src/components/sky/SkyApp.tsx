"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowLeft, CircleDashed, Crosshair, ExternalLink, LoaderCircle, Telescope } from "lucide-react";
import type { SkyActivity } from "@/lib/client/skyFleet";
import { Body, Equator, Observer } from "astronomy-engine";
import { APP_NAME } from "@/lib/brand";
import { formatDec, formatRa, parseCone } from "@/lib/sky/geom";
import { SKY_MAX_RADIUS, type AnalysisStar, type Cone, type SkyAnalysis, type SkyEvent, type SkyObject, type SkyObserver, type SkySourceReport, type SkySummary, type StarResult } from "@/lib/sky/types";
import { CATEGORY_STYLE, SURVEYS, type AtlasApi } from "./SkyAtlas";
import SkySearch from "./SkySearch";

const SkyAtlas = dynamic(() => import("./SkyAtlas"), { ssr: false });

/** Jupiter's J2000 RA/Dec right now (geocentric, astronomy-engine), so the sample never goes stale. */
function jupiterNow(): Cone {
  const e = Equator(Body.Jupiter, new Date(), new Observer(0, 0, 0), false, true);
  return { ra: +(e.ra * 15).toFixed(3), dec: +e.dec.toFixed(3), radius: 2 };
}

export const SAMPLES: { name: string; note: string; cone: Cone }[] = [
  { name: "Orion Nebula", note: "M42 star nursery", cone: { ra: 83.822, dec: -5.391, radius: 0.5 } },
  { name: "Pleiades", note: "M45 open cluster", cone: { ra: 56.75, dec: 24.117, radius: 1.2 } },
  { name: "Andromeda", note: "M31 + satellites", cone: { ra: 10.685, dec: 41.269, radius: 1.5 } },
  { name: "TRAPPIST-1", note: "7 rocky planets", cone: { ra: 346.626, dec: -5.043, radius: 0.5 } },
  { name: "Jupiter now", note: "Live position", cone: jupiterNow() },
];

const QUESTIONS = ["What's the most interesting thing here?", "Are there any planets here?", "Any new transit candidates in the light curves?", "How far away are these objects?"];

type Status = "idle" | "running" | "summarising" | "done" | "error";

export default function SkyApp() {
  const [cone, setCone] = useState<Cone>(SAMPLES[0].cone);
  const [draft, setDraft] = useState({ ra: String(SAMPLES[0].cone.ra), dec: String(SAMPLES[0].cone.dec), radius: String(SAMPLES[0].cone.radius) });
  const [status, setStatus] = useState<Status>("idle");
  const [objects, setObjects] = useState<SkyObject[]>([]);
  const [sources, setSources] = useState<SkySourceReport[]>([]);
  const [summary, setSummary] = useState<SkySummary | null>(null);
  const [obs, setObs] = useState<{ observer: SkyObserver | null; note?: string; ms: number } | null>(null);
  const [observing, setObserving] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [atlasError, setAtlasError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [timing, setTiming] = useState<{ results?: number; summary?: number }>({});
  const [survey, setSurvey] = useState<string>(SURVEYS[0].id);
  const [drawing, setDrawing] = useState(false);
  const [question, setQuestion] = useState("");
  // Light-curve analysis agents (streamed alongside the catalog results).
  const [lcStars, setLcStars] = useState<AnalysisStar[]>([]);
  const [lcResults, setLcResults] = useState<StarResult[]>([]);
  const [analysis, setAnalysis] = useState<{ analysis: SkyAnalysis | null; note?: string; ms: number } | null>(null);
  const [run, setRun] = useState(0);
  const api = useRef<AtlasApi | null>(null);
  const abort = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const applyCone = useCallback((c: Cone, move = false) => {
    const n = parseCone(c);
    if (!n) return;
    setCone(n);
    setDraft({ ra: n.ra.toFixed(4), dec: n.dec.toFixed(4), radius: n.radius.toFixed(3) });
    if (move) api.current?.goto(n);
  }, []);

  const research = useCallback(async (c: Cone, q = "") => {
    abort.current?.abort();
    const ctl = new AbortController();
    abort.current = ctl;
    setStatus("running"); setObjects([]); setSources([]); setSummary(null); setObs(null); setObserving(false); setNote(null); setError(null); setSelected(null); setTiming({});
    setLcStars([]); setLcResults([]); setAnalysis(null); setRun((n) => n + 1);
    try {
      const res = await fetch("/api/sky/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...c, question: q.trim() || undefined }), signal: ctl.signal });
      if (!res.ok || !res.body) throw new Error(`${res.status} ${res.statusText}`);
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          const e = JSON.parse(line) as SkyEvent;
          if (e.type === "results") { setObserving(e.objects.length > 0); setObjects((o) => [...e.objects, ...o]); setSources(e.sources); setTiming((t) => ({ ...t, results: e.ms })); setStatus("summarising"); }
          else if (e.type === "archive") setObjects((o) => [...o, ...e.objects]);
          else if (e.type === "analysis-start") setLcStars(e.stars);
          else if (e.type === "analysis-star") setLcResults((r) => [...r, e.result]);
          else if (e.type === "analysis") { setAnalysis({ analysis: e.analysis, note: e.note, ms: e.ms }); if (e.analysis?.objects.length) setObjects((o) => [...o, ...e.analysis!.objects]); }
          else if (e.type === "summary") { setSummary(e.summary); setNote(e.note ?? null); setTiming((t) => ({ ...t, summary: e.ms })); setStatus("done"); }
          else if (e.type === "observer") { setObs({ observer: e.observer, note: e.note, ms: e.ms }); setObserving(false); }
          else if (e.type === "error") { setError(e.message); setStatus("error"); }
        }
      }
      setObserving(false);
      setStatus((s) => (s === "running" || s === "summarising" ? "done" : s));
    } catch (e) {
      if (ctl.signal.aborted) return;
      setError((e as Error).message); setStatus("error");
    }
  }, []);

  const pickSample = (c: Cone) => { applyCone(c, true); void research(c, question); };
  const runDraft = () => {
    const c = parseCone({ ra: draft.ra, dec: draft.dec, radius: draft.radius });
    if (!c) { setError("Enter RA 0–360°, Dec −90…90°, radius > 0"); return; }
    applyCone(c, true);
    void research(c, question);
  };
  const useView = () => { const v = api.current?.view(); if (v) applyCone(v); };
  const draw = () => {
    if (!api.current) return;
    setDrawing(true);
    api.current.drawCircle((c) => { setDrawing(false); applyCone(c); });
  };
  const select = useCallback((id: string) => {
    setSelected(id);
    requestAnimationFrame(() => listRef.current?.querySelector(`[data-id="${id}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
  }, []);
  const onAtlasError = useCallback((m: string) => setAtlasError(m), []);

  const byId = useMemo(() => new Map(objects.map((o) => [o.id, o])), [objects]);
  const busy = status === "running" || status === "summarising";
  const activity = useMemo<SkyActivity>(() => ({
    run, status, sources, objects, stars: lcStars, starResults: lcResults, analysisDone: !!analysis,
    observer: obs ? "done" : observing ? "working" : "idle",
  }), [run, status, sources, objects, lcStars, lcResults, analysis, obs, observing]);

  return (
    <div className="flex h-dvh flex-col bg-bg text-fg1">
      <header className="dock flex h-12 shrink-0 items-center gap-2.5 border-b border-line px-4">
        <SwarmMark />
        <span className="text-[14px] font-semibold tracking-[-0.01em]">{APP_NAME}</span>
        <span className="truncate text-[12px] text-fg3">Sky research</span>
        <div className="flex-1" />
        <div className="flex h-[30px] items-center gap-0.5 rounded-md border border-line bg-bg p-0.5 max-sm:hidden">
          {SURVEYS.map((s) => (
            <button key={s.id} onClick={() => { setSurvey(s.id); api.current?.setSurvey(s.id); }} aria-pressed={survey === s.id}
              className={`h-full rounded-[4px] px-2.5 text-[12.5px] transition-colors ${survey === s.id ? "bg-active text-fg1 shadow-[inset_0_0_0_1px_var(--line-strong)]" : "text-fg2 hover:text-fg1"}`}>
              {s.label}
            </button>
          ))}
        </div>
        <Link href="/" className="flex h-[30px] shrink-0 items-center gap-1.5 rounded-md border border-line-strong px-3 text-[12.5px] text-fg1 transition-colors hover:bg-raised">
          <ArrowLeft size={13} strokeWidth={1.5} /> Earth
        </Link>
      </header>

      <div className="flex min-h-0 flex-1 max-lg:flex-col">
        <div className="relative min-h-0 flex-1 max-lg:h-[48vh] max-lg:flex-none">
          {atlasError ? (
            <div className="grid h-full place-items-center p-6 text-center text-[13px] text-fg3">Sky atlas unavailable ({atlasError}). Research still works from the panel.</div>
          ) : (
            <SkyAtlas cone={cone} objects={objects} selectedId={selected} onSelect={select} apiRef={api} onError={onAtlasError} activity={activity} />
          )}
          {drawing && <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-[4px] bg-bg/85 px-2 py-0.5 text-[12px] text-fg2">Drag on the sky to draw a circle</div>}
          <Legend objects={objects} />
        </div>

        <aside className="dock scroll-thin flex min-h-0 w-[400px] shrink-0 flex-col overflow-y-auto border-l border-line max-lg:w-full max-lg:flex-1 max-lg:border-l-0 max-lg:border-t">
          <section className="border-b border-line p-4">
            <SkySearch disabled={busy} onPick={(h) => applyCone({ ra: h.ra, dec: h.dec, radius: h.category === "solar-system" ? 2 : cone.radius }, true)} />
            <div className="mb-2 mt-4 text-[11.5px] uppercase tracking-[0.06em] text-fg3">Sample targets</div>
            <div className="flex flex-wrap gap-1.5">
              {SAMPLES.map((s) => (
                <button key={s.name} onClick={() => pickSample(s.cone)} disabled={busy} title={s.note}
                  className="rounded-md border border-line bg-bg px-2.5 py-1 text-[12.5px] text-fg2 transition-colors hover:border-line-strong hover:text-fg1 disabled:opacity-50">
                  {s.name}
                </button>
              ))}
            </div>

            <div className="mb-2 mt-4 text-[11.5px] uppercase tracking-[0.06em] text-fg3">Region (cone, ICRS degrees)</div>
            <div className="grid grid-cols-3 gap-1.5">
              {(["ra", "dec", "radius"] as const).map((k) => (
                <label key={k} className="flex flex-col gap-1">
                  <span className="text-[11px] text-fg3">{k === "ra" ? "RA" : k === "dec" ? "Dec" : `Radius (≤${SKY_MAX_RADIUS}°)`}</span>
                  <input value={draft[k]} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} inputMode="decimal"
                    onKeyDown={(e) => e.key === "Enter" && runDraft()}
                    className="num h-[30px] w-full rounded-md border border-line bg-bg px-2 text-[12.5px] text-fg1 outline-none focus:border-line-strong" />
                </label>
              ))}
            </div>
            <div className="num mt-1.5 text-[11.5px] text-fg4">{formatRa(cone.ra)} {formatDec(cone.dec)} · r {cone.radius.toFixed(3)}°</div>

            <div className="mb-2 mt-4 text-[11.5px] uppercase tracking-[0.06em] text-fg3">Question (optional)</div>
            <textarea value={question} onChange={(e) => setQuestion(e.target.value)} rows={2} maxLength={300} disabled={busy}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); runDraft(); } }}
              placeholder="Ask about this region, e.g. Are there planets here? Leave empty for a briefing."
              className="w-full resize-none rounded-md border border-line bg-bg px-2 py-1.5 text-[12.5px] leading-snug text-fg1 outline-none placeholder:text-fg4 focus:border-line-strong disabled:opacity-60" />
            <div className="mt-1.5 flex flex-wrap gap-1">
              {QUESTIONS.map((q) => (
                <button key={q} onClick={() => setQuestion(q)} disabled={busy}
                  className="rounded-[4px] border border-line px-1.5 py-0.5 text-[11.5px] text-fg3 transition-colors hover:border-line-strong hover:text-fg1 disabled:opacity-50">
                  {q}
                </button>
              ))}
            </div>
            <div className="mt-3 flex gap-1.5">
              <button onClick={draw} disabled={busy || !!atlasError} className="flex h-[30px] items-center gap-1.5 rounded-md border border-line px-2.5 text-[12.5px] text-fg2 hover:text-fg1 disabled:opacity-50">
                <CircleDashed size={13} strokeWidth={1.5} /> Draw circle
              </button>
              <button onClick={useView} disabled={busy || !!atlasError} className="flex h-[30px] items-center gap-1.5 rounded-md border border-line px-2.5 text-[12.5px] text-fg2 hover:text-fg1 disabled:opacity-50">
                <Crosshair size={13} strokeWidth={1.5} /> Use view
              </button>
              <div className="flex-1" />
              <button onClick={runDraft} disabled={busy}
                className="flex h-[30px] items-center gap-1.5 rounded-md bg-accent px-3 text-[12.5px] font-medium text-[#1a1208] transition-opacity hover:opacity-90 disabled:opacity-60">
                {busy ? <LoaderCircle size={13} className="animate-spin" /> : <Telescope size={13} strokeWidth={1.75} />} Research
              </button>
            </div>
          </section>

          {(sources.length > 0 || status === "running") && (
            <section className="border-b border-line p-4">
              <div className="mb-2 flex items-baseline justify-between text-[11.5px] uppercase tracking-[0.06em] text-fg3">
                <span>Sky agents</span>
                {timing.results != null && <span className="num normal-case tracking-normal text-fg4">{(timing.results / 1000).toFixed(1)}s</span>}
              </div>
              {status === "running" && !sources.length && <div className="text-[12.5px] text-fg3">Querying SIMBAD, NASA Exoplanet Archive, JPL Horizons and the MAST telescope archive, and fetching TESS light curves…</div>}
              <ul className="space-y-1">
                {sources.map((s) => (
                  <li key={s.source} className="flex items-center gap-2 text-[12.5px]">
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${s.status === "ok" ? "bg-ok" : s.status === "empty" ? "bg-fg4" : "bg-risk"}`} />
                    <span className="text-fg1">{s.label}</span>
                    <span className="truncate text-fg3" title={s.error ?? s.note}>{s.status === "ok" ? `${s.count} found${s.note ? " (partial)" : ""}` : s.status === "empty" ? (s.source === "telescopes" ? "no archived observations" : "nothing found") : `failed: ${s.error}`}</span>
                    <span className="num ml-auto text-[11.5px] text-fg4">{(s.ms / 1000).toFixed(1)}s</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {(lcStars.length > 0 || analysis || (status === "summarising" && !analysis)) && <AnalysisSection stars={lcStars} results={lcResults} analysis={analysis} running={busy && !analysis} byId={byId} onCite={select} />}

          {(status === "summarising" || summary || note) && (
            <section className="border-b border-line p-4">
              <div className="mb-2 flex items-baseline justify-between text-[11.5px] uppercase tracking-[0.06em] text-fg3">
                <span>{summary?.question ? "Answer" : "Claude summary"}</span>
                {timing.summary != null && summary && <span className="num normal-case tracking-normal text-fg4">{(timing.summary / 1000).toFixed(1)}s</span>}
              </div>
              {status === "summarising" && <div className="caret text-[12.5px] text-fg3">{analysis ? `Reading ${objects.length} results` : "Waiting for the light-curve agents, then reading the results"}</div>}
              {summary && (
                <>
                  {summary.question && <p className="mb-1.5 text-[12px] italic text-fg3">“{summary.question}”</p>}
                  <p className="text-[13.5px] leading-snug text-fg1">{summary.headline}</p>
                  <ul className="mt-2 space-y-2">
                    {summary.bullets.map((b, i) => (
                      <li key={i} className="text-[12.5px] leading-relaxed text-fg2">
                        {b.text.replace(/\s*\[[A-Z]\d+\]/g, "")}{" "}
                        {b.ids.map((id) => (
                          <button key={id} onClick={() => select(id)} title={byId.get(id)?.name}
                            className="num mr-1 rounded-[3px] border border-line px-1 text-[11px] text-fg3 hover:border-line-strong hover:text-fg1">{id}</button>
                        ))}
                      </li>
                    ))}
                  </ul>
                  {summary.dropped > 0 && <div className="mt-2 text-[11.5px] text-fg4">{summary.dropped} point{summary.dropped === 1 ? "" : "s"} dropped for citing results that don&apos;t exist</div>}
                </>
              )}
              {note && <div className="text-[12.5px] text-fg3">{note}</div>}
            </section>
          )}

          {(observing || obs) && <ObserverSection obs={obs} byId={byId} onCite={select} />}

          {error && <div className="border-b border-line p-4 text-[12.5px] text-risk">{error}</div>}

          {status !== "idle" && status !== "running" && (
            <section className="p-4" ref={listRef}>
              <div className="mb-2 text-[11.5px] uppercase tracking-[0.06em] text-fg3">Results <span className="num normal-case tracking-normal text-fg4">{objects.length}</span></div>
              {!objects.length && status !== "error" && <div className="text-[12.5px] text-fg3">Nothing found in this region.</div>}
              <ul className="space-y-1">
                {objects.map((o) => <ResultRow key={o.id} o={o} on={selected === o.id} onClick={() => { setSelected(o.id); api.current?.goto({ ra: o.ra, dec: o.dec, radius: Math.min(cone.radius, 0.3) }); }} />)}
              </ul>
            </section>
          )}

          {status === "idle" && (
            <section className="p-4 text-[12.5px] leading-relaxed text-fg3">
              Pan and zoom the sky, then draw a circle or use the current view. Sky agents query SIMBAD, the NASA Exoplanet Archive, JPL Horizons and MAST live; analysis agents download real TESS light curves of the field&apos;s stars and search them for transits (Box Least Squares) and variability (Lomb-Scargle); Claude writes a cited summary.
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

function ResultRow({ o, on, onClick }: { o: SkyObject; on: boolean; onClick: () => void }) {
  const st = CATEGORY_STYLE[o.category];
  const props = Object.entries(o.props).filter(([k]) => k !== "SIMBAD id" && k !== "object type").slice(0, 4);
  return (
    <li data-id={o.id} className={`rounded-md border px-2.5 py-2 transition-colors ${on ? "border-line-strong bg-active" : "border-transparent hover:bg-raised"}`}>
      <div className="flex items-center gap-2">
        <button onClick={onClick} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: st.color }} />
          <span className="num shrink-0 text-[11px] text-fg4">{o.id}</span>
          <span className="truncate text-[13px] text-fg1">{o.name}</span>
          <span className="truncate text-[12px] text-fg3">{o.type}</span>
        </button>
        <a href={o.url} target="_blank" rel="noreferrer" title="Open source record" className="shrink-0 text-fg4 hover:text-fg1"><ExternalLink size={12} strokeWidth={1.5} /></a>
      </div>
      {on && (
        <div className="mt-1.5 pl-4 text-[11.5px] text-fg3">
          <div className="num">{formatRa(o.ra)} {formatDec(o.dec)}</div>
          {props.map(([k, v]) => <div key={k}>{k}: <span className="text-fg2">{v}</span></div>)}
        </div>
      )}
    </li>
  );
}

/** Observer agent: Claude's visual observations of a DSS2 cutout, with the image and its hips2fits link. */
function ObserverSection({ obs, byId, onCite }: { obs: { observer: SkyObserver | null; note?: string; ms: number } | null; byId: Map<string, SkyObject>; onCite: (id: string) => void }) {
  const o = obs?.observer;
  return (
    <section className="border-b border-line p-4">
      <div className="mb-2 flex items-baseline justify-between text-[11.5px] uppercase tracking-[0.06em] text-fg3">
        <span>Observer</span>
        {o && <span className="num normal-case tracking-normal text-fg4">{(obs!.ms / 1000).toFixed(1)}s</span>}
      </div>
      {!obs && <div className="caret text-[12.5px] text-fg3">Looking at the DSS2 image of this region</div>}
      {obs && !o && <div className="text-[12.5px] text-fg3">{obs.note ?? "No visual observations this run."}</div>}
      {o && (
        <div className="flex gap-3 max-sm:flex-col">
          <a href={o.image} target="_blank" rel="noreferrer" title="Open the hips2fits cutout (DSS2 colour)" className="shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={o.image} alt="DSS2 colour cutout of the research cone" width={112} height={112} className="h-28 w-28 rounded-md border border-line object-cover" />
            <span className="mt-1 flex items-center gap-1 text-[11px] text-fg4 hover:text-fg1">DSS2 cutout <ExternalLink size={10} strokeWidth={1.5} /></span>
          </a>
          <ul className="min-w-0 flex-1 space-y-1.5">
            {o.observations.map((x, i) => (
              <li key={i} className="text-[12.5px] leading-relaxed text-fg2">
                {x.text.replace(/\s*\[[A-Z]\d+\]/g, "")}{" "}
                {x.ids.map((id) => (
                  <button key={id} onClick={() => onCite(id)} title={byId.get(id)?.name}
                    className="num mr-1 rounded-[3px] border border-line px-1 text-[11px] text-fg3 hover:border-line-strong hover:text-fg1">{id}</button>
                ))}
              </li>
            ))}
            {o.dropped > 0 && <li className="text-[11.5px] text-fg4">{o.dropped} observation{o.dropped === 1 ? "" : "s"} dropped for citing results that don&apos;t exist</li>}
          </ul>
        </div>
      )}
    </section>
  );
}

const AGENT_COLOR: Record<string, string> = { lightcurves: "#5ec8d8", transits: "#f2c35b", variability: "#b39dff", vetting: "#ff8f7a" };
const fmt = (n: number, d = 3) => (Number.isFinite(n) ? +n.toPrecision(d) : "n/a");

/** Light-curve analysis agents: per-star progress while running, then each agent's report and the
 *  Vetter's verdicts. Unvetted candidates are labelled as needing follow-up, never as discoveries. */
function AnalysisSection({ stars, results, analysis, running, byId, onCite }: {
  stars: AnalysisStar[]; results: StarResult[]; analysis: { analysis: SkyAnalysis | null; note?: string; ms: number } | null; running: boolean;
  byId: Map<string, SkyObject>; onCite: (id: string) => void;
}) {
  const a = analysis?.analysis;
  const byTic = new Map(results.map((r) => [r.tic, r]));
  const signals = a?.objects.filter((o) => o.category === "candidate") ?? [];
  return (
    <section className="border-b border-line p-4">
      <div className="mb-2 flex items-baseline justify-between text-[11.5px] uppercase tracking-[0.06em] text-fg3">
        <span>Light-curve analysis</span>
        {analysis && <span className="num normal-case tracking-normal text-fg4">{(analysis.ms / 1000).toFixed(1)}s</span>}
      </div>
      {running && !stars.length && <div className="caret text-[12.5px] text-fg3">Finding TESS light curves for the stars in this cone</div>}
      {analysis && !a && <div className="text-[12.5px] text-fg3">{analysis.note ?? "Light-curve analysis unavailable this run."}</div>}
      {a?.note && <div className="text-[12.5px] text-fg3">{a.note}</div>}
      {a && a.agents.length > 0 && (
        <ul className="mb-2 space-y-1">
          {a.agents.map((r) => (
            <li key={r.agent} className="flex items-start gap-2 text-[12.5px]">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: r.status === "error" ? "var(--risk)" : AGENT_COLOR[r.agent] }} />
              <span className="min-w-0"><span className="text-fg1">{r.label}</span> <span className="text-fg3">{r.detail}</span></span>
            </li>
          ))}
        </ul>
      )}
      {signals.length > 0 && (
        <ul className="mb-2 space-y-1.5">
          {signals.map((o) => {
            const fresh = o.type.startsWith("Unvetted");
            return (
              <li key={o.id} className={`rounded-md border px-2.5 py-1.5 text-[12.5px] ${fresh ? "border-[#f2c35b]/50 bg-[#f2c35b]/[0.06]" : "border-line"}`}>
                <button onClick={() => onCite(o.id)} className="flex w-full items-center gap-2 text-left">
                  <span className="num shrink-0 text-[11px] text-fg4">{o.id}</span>
                  <span className={`truncate ${fresh ? "text-[#f2c35b]" : "text-fg1"}`}>{o.type}</span>
                </button>
                <div className="num mt-0.5 text-[11.5px] text-fg3">
                  TIC {o.props.TIC} · P {o.props["period (days)"]} d · depth {o.props["depth (ppt)"]} ppt · {o.props["duration (hours)"]} h · SNR {o.props.SNR}
                </div>
                {fresh && <div className="mt-0.5 text-[11.5px] text-fg3">Unvetted candidate: needs follow-up observations, not a confirmed planet.</div>}
              </li>
            );
          })}
        </ul>
      )}
      {stars.length > 0 && (
        <ul className="space-y-0.5">
          {stars.map((s) => {
            const r = byTic.get(s.tic);
            const t = r?.transit, v = r?.variability;
            return (
              <li key={s.tic} className="flex items-center gap-2 text-[12px]">
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${!r ? "animate-pulse bg-fg4" : r.status !== "ok" ? "bg-risk" : t?.detected ? "bg-[#f2c35b]" : "bg-ok"}`} />
                <a href={`https://exofop.ipac.caltech.edu/tess/target.php?id=${s.tic}`} target="_blank" rel="noreferrer" className="num shrink-0 text-fg2 hover:text-fg1">TIC {s.tic}</a>
                <span className="truncate text-fg4">{s.name.startsWith("TIC ") ? `${s.pipeline} s${s.sector}` : `${s.name} · ${s.pipeline} s${s.sector}`}</span>
                <span className="num ml-auto shrink-0 text-[11.5px] text-fg3" title={r?.error}>
                  {!r ? "…" : r.status !== "ok" ? r.status === "skipped" ? "skipped" : "failed" : [t?.detected ? `dip P ${fmt(t.period, 4)} d` : "no transit", v?.variable ? `var ${fmt(v.period)} d` : null].filter(Boolean).join(" · ")}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {a && byId.size > 0 && a.objects.some((o) => o.category === "variable") && (
        <div className="mt-2 text-[11.5px] text-fg4">Variable stars: {a.objects.filter((o) => o.category === "variable").map((o) => o.id).join(", ")} in the results list.</div>
      )}
    </section>
  );
}

function Legend({ objects }: { objects: SkyObject[] }) {
  const counts = new Map<string, number>();
  for (const o of objects) counts.set(o.category, (counts.get(o.category) ?? 0) + 1);
  if (!counts.size) return null;
  return (
    <div className="surface pointer-events-none absolute right-3 top-3 rounded-md px-2.5 py-1.5 text-[11.5px]">
      {[...counts].map(([cat, n]) => {
        const st = CATEGORY_STYLE[cat as keyof typeof CATEGORY_STYLE];
        return <div key={cat} className="flex items-center gap-1.5 text-fg2"><span className="h-2 w-2 rounded-full" style={{ background: st.color }} />{st.label}<span className="num text-fg4">{n}</span></div>;
      })}
    </div>
  );
}

/** Same three-dot mark as TopBar's SwarmMark (inlined so this page doesn't pull in the map app's stores). */
function SwarmMark({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden className="shrink-0">
      <path d="M10 4.5 4.5 14h11z" fill="none" stroke="var(--fg1)" strokeOpacity=".3" strokeWidth="1" />
      <circle cx="10" cy="4.5" r="2.2" fill="var(--fg1)" />
      <circle cx="4.5" cy="14" r="2.2" fill="var(--fg1)" />
      <circle cx="15.5" cy="14" r="2.2" fill="var(--accent)" />
    </svg>
  );
}
