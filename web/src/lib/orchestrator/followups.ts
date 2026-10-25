// Re-dispatch follow-ups from the coverage check (README §3a): "send a worker back out with a narrower task".

export interface FollowUp { agentId: string; instruction: string }

export const MAX_FOLLOWUPS = 2;

/** Keeps follow-ups for agents that ran this run, one per agent, non-empty, capped. */
export function pickFollowups(raw: FollowUp[] | undefined, eligible: string[], max = MAX_FOLLOWUPS): FollowUp[] {
  const out: FollowUp[] = [];
  for (const f of raw ?? []) {
    const agentId = f.agentId.trim();
    const instruction = f.instruction.trim().slice(0, 400);
    if (!instruction || !eligible.includes(agentId) || out.some((o) => o.agentId === agentId)) continue;
    out.push({ agentId, instruction });
    if (out.length >= max) break;
  }
  return out;
}
