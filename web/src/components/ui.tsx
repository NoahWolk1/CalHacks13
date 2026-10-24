"use client";
import type { AgentConfig, AgentStatus, VehicleKind } from "@/lib/types";
import { VEHICLE_ICON } from "@/lib/client/icons";

/** Vehicle silhouette tinted with the agent's color (same art as the map). */
export function VehicleGlyph({ kind, color, size = 18 }: { kind: VehicleKind; color: string; size?: number }) {
  const url = `url("${VEHICLE_ICON[kind]}")`;
  return <span className="inline-block shrink-0" style={{ width: size, height: size, background: color, WebkitMaskImage: url, maskImage: url, WebkitMaskSize: "contain", maskSize: "contain", WebkitMaskRepeat: "no-repeat", maskRepeat: "no-repeat" }} />;
}

export function AgentAvatar({ agent, size = 34 }: { agent: AgentConfig; size?: number }) {
  return (
    <span className="relative grid shrink-0 place-items-center rounded-lg" style={{ width: size, height: size, background: `${agent.color}1f`, boxShadow: `inset 0 0 0 1px ${agent.color}55` }}>
      <VehicleGlyph kind={agent.vehicle} color={agent.color} size={size * 0.6} />
    </span>
  );
}

const STATUS: Record<AgentStatus, { label: string; cls: string }> = {
  idle: { label: "Standby", cls: "text-slate-400 bg-slate-500/10" },
  queued: { label: "Queued", cls: "text-slate-300 bg-slate-500/15" },
  deploying: { label: "Deploying", cls: "text-sky-300 bg-sky-500/15" },
  scanning: { label: "Scanning", cls: "text-teal-300 bg-teal-500/15" },
  done: { label: "Reported", cls: "text-emerald-300 bg-emerald-500/10" },
  error: { label: "Failed", cls: "text-rose-300 bg-rose-500/15" },
};

export function StatusPill({ status }: { status: AgentStatus }) {
  const s = STATUS[status];
  const live = status === "deploying" || status === "scanning";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${s.cls}`}>
      <span className="relative flex h-1.5 w-1.5">
        {live && <span className="ping-soft absolute inline-flex h-full w-full rounded-full bg-current" />}
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-current" />
      </span>
      {s.label}
    </span>
  );
}

export function SectionLabel({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">
      <span>{children}</span>
      {right}
    </div>
  );
}
