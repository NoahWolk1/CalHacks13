"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowLeft, CircleDashed, Crosshair, ExternalLink, LoaderCircle, Telescope } from "lucide-react";
import { APP_NAME } from "@/lib/brand";
import { formatDec, formatRa, parseCone } from "@/lib/sky/geom";
import { SKY_MAX_RADIUS, type Cone, type SkyEvent, type SkyObject, type SkySourceReport, type SkySummary } from "@/lib/sky/types";
import { CATEGORY_STYLE, SURVEYS, type AtlasApi } from "./SkyAtlas";

const SkyAtlas = dynamic(() => import("./SkyAtlas"), { ssr: false });

export const SAMPLES: { name: string; note: string; cone: Cone }[] = [
  { name: "Orion Nebula", note: "M42 star nursery", cone: { ra: 83.822, dec: -5.391, radius: 0.5 } },
  { name: "Pleiades", note: "M45 open cluster", cone: { ra: 56.75, dec: 24.117, radius: 1.2 } },
  { name: "Andromeda", note: "M31 + satellites", cone: { ra: 10.685, dec: 41.269, radius: 1.5 } },
  { name: "TRAPPIST-1", note: "7 rocky planets", cone: { ra: 346.626, dec: -5.043, radius: 0.5 } },
  { name: "Jupiter now", note: "Oct 2026 position", cone: { ra: 145.7, dec: 14.4, radius: 2 } },
];

type Status = "idle" | "running" | "summarising" | "done" | "error";

export default function SkyApp() {
  const [cone, setCone] = useState<Cone>(SAMPLES[0].cone);
  const [draft, setDraft] = useState({ ra: String(SAMPLES[0].cone.ra), dec: String(SAMPLES[0].cone.dec), radius: String(SAMPLES[0].cone.radius) });
  const [status, setStatus] = useState<Status>("idle");
  const [objects, setObjects] = useState<SkyObject[]>([]);
  const [sources, setSources] = useState<SkySourceReport[]>([]);
  const [summary, setSummary] = useState<SkySummary | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [atlasError, setAtlasError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [timing, setTiming] = useState<{ results?: number; summary?: number }>({});
  const [survey, setSurvey] = useState<string>(SURVEYS[0].id);
  const [drawing, setDrawing] = useState(false);
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

  const research = useCallback(async (c: Cone) => {
    abort.current?.abort();
    const ctl = new AbortController();
    abort.current = ctl;
    setStatus("running"); setObjects([]); setSources([]); setSummary(null); setNote(null); setError(null); setSelected(null); setTiming({});
    try {
      const res = await fetch("/api/sky/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(c), signal: ctl.signal });
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
          if (e.type === "results") { setObjects(e.objects); setSources(e.sources); setTiming((t) => ({ ...t, results: e.ms })); setStatus("summarising"); }
          else if (e.type === "summary") { setSummary(e.summary); setNote(e.note ?? null); setTiming((t) => ({ ...t, summary: e.ms })); setStatus("done"); }
          else if (e.type === "error") { setError(e.message); setStatus("error"); }
        }
      }
      setStatus((s) => (s === "running" || s === "summarising" ? "done" : s));
    } catch (e) {
      if (ctl.signal.aborted) return;
      setError((e as Error).message); setStatus("error");
    }
  }, []);

  const pickSample = (c: Cone) => { applyCone(c, true); void research(c); };
  const runDraft = () => {
    const c = parseCone({ ra: draft.ra, dec: draft.dec, radius: draft.radius });
    if (!c) { setError("Enter RA 0–360°, Dec −90…90°, radius > 0"); return; }
    applyCone(c, true);
    void research(c);
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
            <SkyAtlas cone={cone} objects={objects} selectedId={selected} onSelect={select} apiRef={api} onError={onAtlasError} />
          )}
          {drawing && <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-[4px] bg-bg/85 px-2 py-0.5 text-[12px] text-fg2">Drag on the sky to draw a circle</div>}
          <Legend objects={objects} />
        </div>

        <aside className="dock scroll-thin flex min-h-0 w-[400px] shrink-0 flex-col overflow-y-auto border-l border-line max-lg:w-full max-lg:flex-1 max-lg:border-l-0 max-lg:border-t">
          <section className="border-b border-line p-4">
            <div className="mb-2 text-[11.5px] uppercase tracking-[0.06em] text-fg3">Sample targets</div>
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
              {status === "running" && !sources.length && <div className="text-[12.5px] text-fg3">Querying SIMBAD, NASA Exoplanet Archive and JPL Horizons…</div>}
              <ul className="space-y-1">
                {sources.map((s) => (
                  <li key={s.source} className="flex items-center gap-2 text-[12.5px]">
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${s.status === "ok" ? "bg-ok" : s.status === "empty" ? "bg-fg4" : "bg-risk"}`} />
                    <span className="text-fg1">{s.label}</span>
                    <span className="truncate text-fg3" title={s.error}>{s.status === "ok" ? `${s.count} found` : s.status === "empty" ? "nothing found" : `failed: ${s.error}`}</span>
                    <span className="num ml-auto text-[11.5px] text-fg4">{(s.ms / 1000).toFixed(1)}s</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {(status === "summarising" || summary || note) && (
            <section className="border-b border-line p-4">
              <div className="mb-2 flex items-baseline justify-between text-[11.5px] uppercase tracking-[0.06em] text-fg3">
                <span>Claude summary</span>
                {timing.summary != null && summary && <span className="num normal-case tracking-normal text-fg4">{(timing.summary / 1000).toFixed(1)}s</span>}
              </div>
              {status === "summarising" && <div className="caret text-[12.5px] text-fg3">Reading {objects.length} results</div>}
              {summary && (
                <>
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
              Pan and zoom the sky, then draw a circle or use the current view. Sky agents query SIMBAD, the NASA Exoplanet Archive and JPL Horizons live, and Claude writes a cited summary.
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
