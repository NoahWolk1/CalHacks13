"use client";
// Follow-up vetting of one find, inside its card: streams /api/sky/vet (Stage 0 catalogs, then every
// TESS sector of the star) and shows each check as it's decided, the individual-transit table, the
// tier and what's still open. Finished reports are saved on the server: opening a find that was
// vetted before (here or on another device) shows the saved report, and the re-run button refreshes it.
import { useEffect, useRef, useState } from "react";
import { Copy, RotateCw } from "lucide-react";
import { rememberVet, savedVetFor } from "@/lib/client/savedVets";
import { STAGE_LABEL, TIER_LABEL, reportText, type VetCheck, type VetEventRow, type VetInput, type VetReport, type VetStage, type VetStatus, type VetStreamEvent } from "@/lib/sky/vetShared";

type State = { checks: VetCheck[]; events: VetEventRow[]; progress: string; report: VetReport | null; error: string | null; running: boolean; savedAt?: number; loading?: boolean };
const empty = (): State => ({ checks: [], events: [], progress: "", report: null, error: null, running: false });
const fromReport = (report: VetReport, savedAt?: number): State => ({ ...empty(), report, checks: report.checks, events: report.events, savedAt });
const done = new Map<string, State>();
const keyOf = (i: VetInput) => JSON.stringify([i.tic, i.kind, i.period, i.t0, i.times]);

const STATUS: Record<VetStatus, { label: string; cls: string }> = {
  pass: { label: "pass", cls: "bg-ok/15 text-ok" },
  flag: { label: "flag", cls: "bg-[#f2c35b]/15 text-[#f2c35b]" },
  fail: { label: "fail", cls: "bg-risk/15 text-risk" },
  "not-run": { label: "not run", cls: "bg-fg4/15 text-fg3" },
  info: { label: "info", cls: "bg-[#5ec8d8]/15 text-[#5ec8d8]" },
};
const TIER_CLS: Record<VetReport["tier"], string> = { A: "bg-ok/20 text-ok", B: "bg-[#7fd1b9]/20 text-[#7fd1b9]", C: "bg-[#f2c35b]/20 text-[#f2c35b]", X: "bg-risk/20 text-risk", K: "bg-[#5ec8d8]/20 text-[#5ec8d8]" };

function savedAgo(t: number) {
  const m = Math.round((Date.now() - t) / 60_000);
  return m < 1 ? "just now" : m < 60 ? `${m}m ago` : m < 48 * 60 ? `${Math.round(m / 60)}h ago` : new Date(t).toLocaleDateString();
}

export default function VetPanel({ input }: { input: VetInput }) {
  const key = keyOf(input);
  const [st, setSt] = useState<State>(() => done.get(key) ?? empty());
  const ctl = useRef<AbortController | null>(null);

  const run = async (force = false) => {
    ctl.current?.abort();
    const ac = new AbortController();
    ctl.current = ac;
    let s: State = { ...empty(), running: true, progress: "Starting" };
    setSt(s);
    const update = (patch: Partial<State>) => { s = { ...s, ...patch }; setSt(s); };
    try {
      const res = await fetch("/api/sky/vet", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...input, force }), signal: ac.signal });
      if (!res.ok || !res.body) throw new Error((await res.json().catch(() => null))?.error ?? `${res.status} ${res.statusText}`);
      const reader = res.body.getReader(), dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done: end } = await reader.read();
        if (end) break;
        buf += dec.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl); buf = buf.slice(nl + 1);
          if (!line.trim()) continue;
          const e = JSON.parse(line) as VetStreamEvent;
          if (e.type === "progress") update({ progress: e.text });
          else if (e.type === "check") update({ checks: [...s.checks, e.check] });
          else if (e.type === "events") update({ events: e.events });
          else if (e.type === "report") update({ report: e.report, checks: e.report.checks, events: e.report.events });
          else if (e.type === "saved") { update({ savedAt: e.saved.savedAt }); rememberVet(e.saved); }
          else if (e.type === "error") update({ error: e.message });
        }
      }
      update({ running: false });
      if (s.report) done.set(key, s);
    } catch (e) {
      if (!ac.signal.aborted) update({ running: false, error: (e as Error).message });
    }
  };

  useEffect(() => {
    // Saved before (any device): show that report; otherwise run now.
    if (!done.has(key)) {
      let live = true;
      setSt({ ...empty(), loading: true, progress: "Looking for a saved report" });
      void savedVetFor(input).then((v) => {
        if (!live) return;
        if (v) { const s = fromReport(v.report, v.savedAt); done.set(key, s); setSt(s); }
        else void run();
      });
      return () => { live = false; ctl.current?.abort(); };
    }
    return () => ctl.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const r = st.report;
  const stages = ([0, 1, 2, 3, 4] as VetStage[]).map((stage) => ({ stage, checks: st.checks.filter((c) => c.stage === stage) })).filter((x) => x.checks.length);
  return (
    <div className="mt-2 border-t border-line pt-2">
      <div className="flex items-center gap-2">
        {r ? <span className={`rounded px-1.5 py-px text-[11px] font-medium ${TIER_CLS[r.tier]}`}>Tier {TIER_LABEL[r.tier]}</span>
          : <span className="caret text-[11.5px] text-fg3">{st.progress || "Vetting"}</span>}
        <div className="flex-1" />
        {r && <CopyButton text={reportText(r)} />}
        {st.savedAt && !st.running && <span className="num text-[10.5px] text-fg4" title={new Date(st.savedAt).toLocaleString()}>saved {savedAgo(st.savedAt)}</span>}
        {!st.running && !st.loading && <button onClick={() => void run()} title="Run the vetting again (replaces the saved report)" className="text-fg3 hover:text-fg1"><RotateCw size={11} /></button>}
      </div>
      {st.error && <div className="mt-1 text-[11.5px] text-risk">{st.error}</div>}
      {r && <div className="mt-1 text-[11.5px] text-fg2">{r.tierReason}</div>}
      {r?.gated && !r.events.length && (
        <button onClick={() => void run(true)} className="mt-1 text-[11.5px] text-[#7fd1b9] hover:underline">Continue past the gate (run Stages 1-4 anyway)</button>
      )}
      {r && <div className="num mt-0.5 text-[11px] text-fg4">{r.lightCurves} light curves · sectors {r.sectors.join(", ") || "none"} · {Math.round(r.ms / 1000)} s</div>}

      <div className="mt-1.5 space-y-1">
        {stages.map(({ stage, checks }) => {
          const n = (s: VetStatus) => checks.filter((c) => c.status === s).length;
          const bad = n("fail") + n("flag");
          return (
            <details key={stage} open={bad > 0 || stage === 4 || !r}>
              <summary className="cursor-pointer text-[11px] text-fg3">
                {STAGE_LABEL[stage]}
                <span className="num ml-1.5 text-fg4">{(["fail", "flag", "pass", "not-run", "info"] as VetStatus[]).filter((s) => n(s)).map((s) => `${n(s)} ${STATUS[s].label}`).join(" · ")}</span>
              </summary>
              <ul className="mt-0.5 space-y-0.5 pl-1">
                {checks.map((c) => (
                  <li key={c.id} className="text-[11.5px] leading-snug">
                    <span className={`mr-1.5 inline-block w-[46px] rounded px-1 text-center text-[10px] ${STATUS[c.status].cls}`}>{STATUS[c.status].label}</span>
                    <span className="text-fg1">{c.name}</span>
                    <div className="ml-[52px] text-fg3">
                      {c.value && <div className="num text-[11px] text-fg2">{c.value}</div>}
                      {c.detail}
                    </div>
                  </li>
                ))}
              </ul>
            </details>
          );
        })}
      </div>

      {r && <PixelView r={r} />}
      {st.events.length > 0 && <EventTable events={st.events} />}
      {r?.next?.length ? <div className="num mt-1 text-[11px] text-fg3">Next transits: {r.next.map((x) => `${x.utc}${x.err ? ` ± ${Math.max(1, Math.round(x.err * 1440))} min` : ""}`).join(" · ")}</div> : null}
      {r && <div className="mt-1 text-[11.5px] text-fg2">{r.submit}</div>}
    </div>
  );
}

type Pixels = {
  sector: number; detection: number;
  nx: number; ny: number; diff: number[]; oot: number[];
  target: { x: number; y: number }; source?: { x: number; y: number };
  stars: { x: number; y: number; label: string }[];
  verdict?: string;
};

function PixelView({ r }: { r: VetReport }) {
  const px = (r as VetReport & { pixels?: Pixels }).pixels;
  if (!px || !px.nx || !px.ny || px.diff.length < px.nx * px.ny) return null;
  const fin = (a: number[]) => a.filter(Number.isFinite);
  const o = fin(px.oot), lo = o.length ? Math.min(...o) : 0, hi = o.length ? Math.max(...o) : 1;
  const ad = fin(px.diff).map(Math.abs).sort((a, b) => a - b);
  const scale = ad[Math.min(ad.length - 1, Math.floor(ad.length * 0.98))] || 1;
  const grey = (v: number) => { if (!Number.isFinite(v)) return "#000"; const g = Math.round(255 * Math.sqrt(Math.max(0, (v - lo) / (hi - lo || 1)))); return `rgb(${g},${g},${g})`; };
  const div = (v: number) => {
    if (!Number.isFinite(v)) return "#000";
    const t = Math.max(-1, Math.min(1, v / scale)), [R, G, B] = t >= 0 ? [242, 195, 91] : [94, 200, 216], a = Math.abs(t), base = 22;
    return `rgb(${Math.round(base + (R - base) * a)},${Math.round(base + (G - base) * a)},${Math.round(base + (B - base) * a)})`;
  };
  return (
    <details open className="mt-1.5">
      <summary className="cursor-pointer text-[11px] text-fg3">Pixels · sector {px.sector}</summary>
      <div className="mt-1 flex gap-3 max-sm:flex-col">
        <Heat px={px} vals={px.oot} color={grey} title="Out of transit" />
        <Heat px={px} vals={px.diff} color={div} title="Difference (in-transit loss)" cross />
      </div>
      <div className="num mt-1 text-[11px] text-fg2">source detected at {px.detection.toFixed(1)}σ</div>
      {px.verdict && <div className="text-[11.5px] text-fg3">{px.verdict}</div>}
    </details>
  );
}

function Heat({ px, vals, color, title, cross }: { px: Pixels; vals: number[]; color: (v: number) => string; title: string; cross?: boolean }) {
  const { nx, ny } = px, k = 120 / Math.max(nx, ny), w = nx * k, h = ny * k;
  // pixel centres at integers; y=0 at the bottom
  const X = (x: number) => (x + 0.5) * k, Y = (y: number) => h - (y + 0.5) * k;
  const cells = [];
  for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) cells.push(<rect key={y * nx + x} x={x * k} y={h - (y + 1) * k} width={k + 0.3} height={k + 0.3} fill={color(vals[y * nx + x])} />);
  return (
    <div>
      <div className="mb-0.5 text-[10.5px] text-fg3">{title}</div>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="rounded-sm bg-black">
        {cells}
        {px.stars.map((s, i) => <circle key={i} cx={X(s.x)} cy={Y(s.y)} r={2} fill="#9aa3ad" stroke="#000" strokeWidth={0.5}><title>{s.label}</title></circle>)}
        <circle cx={X(px.target.x)} cy={Y(px.target.y)} r={Math.max(4, k * 0.6)} fill="none" stroke="#fff" strokeWidth={1.2}><title>target</title></circle>
        {cross && px.source && <path d={`M${X(px.source.x) - 4} ${Y(px.source.y)}h8M${X(px.source.x)} ${Y(px.source.y) - 4}v8`} stroke="#ff6b6b" strokeWidth={1.4}><title>fitted source</title></path>}
      </svg>
    </div>
  );
}

function EventTable({ events }: { events: VetEventRow[] }) {
  const shown = events.length > 60 ? events.slice(-60) : events;
  return (
    <details className="mt-1.5">
      <summary className="cursor-pointer text-[11px] text-fg3">{events.length} individual transit{events.length === 1 ? "" : "s"}{events.length > 60 ? " (latest 60 shown; all in the copied report)" : ""}</summary>
      <table className="num mt-1 w-full text-[10.5px] text-fg2">
        <thead className="text-fg4"><tr><th className="text-left font-normal">BTJD</th><th className="text-left font-normal">sector</th><th className="text-right font-normal">depth ppt</th><th className="text-right font-normal">SNR</th><th className="text-right font-normal">cov</th><th className="text-right font-normal">O−C min</th></tr></thead>
        <tbody>
          {shown.map((e) => (
            <tr key={`${e.n}:${e.t}`} title={e.note} className={e.coverage < 0.5 ? "text-fg4" : ""}>
              <td>{e.t.toFixed(3)}</td>
              <td>s{e.sector} {e.pipeline === "SPOC" ? "" : e.pipeline}</td>
              <td className="text-right">{e.depth !== undefined ? `${(e.depth * 1000).toFixed(2)}±${((e.err ?? 0) * 1000).toFixed(2)}` : "–"}</td>
              <td className="text-right">{e.snr !== undefined ? e.snr.toFixed(1) : "–"}</td>
              <td className="text-right">{Math.round(e.coverage * 100)}%</td>
              <td className="text-right">{e.oc !== undefined ? `${(e.oc * 1440).toFixed(1)}` : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

function CopyButton({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button onClick={async () => { try { await navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 1500); } catch { /* clipboard blocked */ } }}
      title="Copy the full report (every check, every transit) as text" className="flex items-center gap-1 text-[11px] text-fg3 hover:text-fg1">
      <Copy size={11} />{ok ? "copied" : "report"}
    </button>
  );
}
