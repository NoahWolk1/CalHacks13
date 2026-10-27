// Shared pieces for showing what the discovery agents found: the quick run's AnalysisSection
// (SkyApp) and the deep-survey panel (SurveyPanel).
import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import type { AnalysisStar, SkyNote, SkyObject } from "@/lib/sky/types";
import { vetInputFrom } from "@/lib/sky/vetShared";
import VetPanel from "./VetPanel";

export const AGENT_COLOR: Record<string, string> = { strategist: "#7fd1b9", lightcurves: "#5ec8d8", transits: "#f2c35b", singles: "#f7a35c", variability: "#b39dff", vetting: "#ff8f7a", census: "#c9a0ff", followup: "#8fd16a" };
export const PLAYBOOK: Record<AnalysisStar["playbook"], string> = { "multi-planet": "multi-planet", "long-period": "long-period", "deep-search": "deep", census: "census" };
export const fmt = (n: number, d = 3) => (Number.isFinite(n) ? +n.toPrecision(d) : "n/a");
export const sectorList = (s: number[]) => (s.length > 2 && s[s.length - 1] - s[0] === s.length - 1 ? `s${s[0]}–${s[s.length - 1]}` : `s${s.join(",")}`);

/** One-line numbers for a find: period, time or duotransit periods, depth, SNR. */
export function findLine(o: SkyObject) {
  const p = o.props;
  if (o.category === "variable") return `TIC ${p.TIC} · P ${p["period (days)"]} d · ${p["amplitude (ppt)"]} ppt`;
  const when = p["period (days)"] !== undefined ? `P ${p["period (days)"]} d`
    : p["times (BTJD)"] !== undefined ? `BTJD ${p["times (BTJD)"]}${p["possible periods"] ? ` · ${p["possible periods"]} possible periods, longest ${String(p["longest possible periods (days)"]).split(", ").slice(0, 3).join(", ")} d` : ""}`
      : `BTJD ${p["time (BTJD)"]}`;
  return `TIC ${p.TIC} · ${when} · depth ${p["depth (ppt)"]} ppt · ${p["duration (hours)"]} h · SNR ${p.SNR}${p["implied radius (Earth = 1)"] ? ` · ~${p["implied radius (Earth = 1)"]} R⊕` : ""}`;
}

/** A new find: labelled as a candidate needing follow-up, never as a discovery. Transit finds can be
 *  vetted in depth (VetPanel). */
export function FindCard({ o, onCite }: { o: SkyObject; onCite: (id: string) => void }) {
  const [vet, setVet] = useState(false);
  const input = vetInputFrom(o);
  return (
    <li className="rounded-md border border-[#f2c35b]/50 bg-[#f2c35b]/[0.06] px-2.5 py-1.5 text-[12.5px]">
      <div className="flex items-center gap-2">
        <button onClick={() => onCite(o.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <span className="num shrink-0 text-[11px] text-fg4">{o.id}</span>
          <span className="truncate text-[#f2c35b]">{o.type}</span>
        </button>
        {input && (
          <button onClick={() => setVet((v) => !v)} title="Vet this find: host star, every transit, false-positive and blend tests, a tier"
            className={`flex shrink-0 items-center gap-1 rounded border px-1.5 py-px text-[11px] ${vet ? "border-[#7fd1b9]/60 text-[#7fd1b9]" : "border-line text-fg3 hover:text-fg1"}`}>
            <ShieldCheck size={11} />vet
          </button>
        )}
      </div>
      <div className="num mt-0.5 text-[11.5px] text-fg3">{findLine(o)}</div>
      {o.props.seasons && <div className="mt-0.5 text-[11.5px] text-fg3">{String(o.props.seasons)}</div>}
      {o.props["follow-up"] && <div className="mt-0.5 text-[11.5px] text-fg2">Follow-up: {o.props["follow-up"]}</div>}
      {vet && input && <VetPanel input={input} />}
    </li>
  );
}

/** The agents' lab notebook: what the Strategist decided and noticed, Follow-up results, citing ids. */
export function Notebook({ notes, byId, onCite, label, tail }: { notes: SkyNote[]; byId: Map<string, SkyObject>; onCite: (id: string) => void; label?: (n: SkyNote, i: number) => string; tail?: React.ReactNode }) {
  if (!notes.length && !tail) return null;
  return (
    <ol className="mb-2.5 space-y-1 border-l-2 pl-2.5" style={{ borderColor: AGENT_COLOR.strategist + "66" }}>
      {notes.map((n, i) => (
        <li key={i} className="text-[12.5px] leading-snug">
          <span className="mr-1.5 text-[10.5px] uppercase tracking-[0.05em]" style={{ color: AGENT_COLOR[n.agent] }}>{label?.(n, i) ?? (n.agent === "followup" ? "Follow-up" : n.agent === "strategist" ? "Strategist" : n.agent)}</span>
          <span className="text-fg2">{n.text}</span>
          {n.ids?.filter((id) => byId.has(id)).map((id) => (
            <button key={id} onClick={() => onCite(id)} className="num ml-1 rounded border border-line px-1 text-[10.5px] text-fg3 hover:text-fg1">{id}</button>
          ))}
        </li>
      ))}
      {tail}
    </ol>
  );
}
