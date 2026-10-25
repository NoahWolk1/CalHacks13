"use client";
import type { AgentConfig, AgentStatus, VehicleKind } from "@/lib/types";
import { VEHICLE_ICON } from "@/lib/client/icons";

/** Vehicle silhouette tinted with the agent's color (same art as the map). */
export function VehicleGlyph({ kind, color, size = 18 }: { kind: VehicleKind; color: string; size?: number }) {
  const url = `url("${VEHICLE_ICON[kind]}")`;
  return <span className="inline-block shrink-0" style={{ width: size, height: size, background: color, WebkitMaskImage: url, maskImage: url, WebkitMaskSize: "contain", maskSize: "contain", WebkitMaskRepeat: "no-repeat", maskRepeat: "no-repeat", WebkitMaskPosition: "center", maskPosition: "center" }} />;
}

/** The agent's identity mark: its vehicle in its colour, in a fixed-size cell (no tinted tile). */
export function AgentAvatar({ agent, size = 34 }: { agent: AgentConfig; size?: number }) {
  return (
    <span className="grid shrink-0 place-items-center" style={{ width: size * 0.6, height: size * 0.6 }}>
      <VehicleGlyph kind={agent.vehicle} color={agent.color} size={Math.round(size * 0.55)} />
    </span>
  );
}

const STATUS: Record<AgentStatus, { label: string; cls: string; dot: string }> = {
  idle: { label: "Standby", cls: "text-fg3", dot: "bg-fg4" },
  queued: { label: "Queued", cls: "text-fg3", dot: "bg-fg4" },
  deploying: { label: "Deploying", cls: "text-fg2", dot: "bg-fg2" },
  scanning: { label: "Scanning", cls: "text-fg1", dot: "bg-accent" },
  done: { label: "Reported", cls: "text-fg3", dot: "bg-ok" },
  error: { label: "Failed", cls: "text-risk", dot: "bg-risk" },
};

/** Status as quiet text with a 6px dot. No pill, no ping. */
export function StatusPill({ status }: { status: AgentStatus }) {
  const s = STATUS[status];
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 text-[12px] ${s.cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

export function SectionLabel({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between text-[12px] text-fg3">
      <span>{children}</span>
      {right}
    </div>
  );
}
