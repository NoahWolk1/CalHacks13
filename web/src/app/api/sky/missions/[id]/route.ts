import { missionStore, validMissionId } from "@/lib/sky/missionStore";
import type { MissionView } from "@/lib/sky/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A run that hasn't written for this long was cut off (instance gone): shown as stopped. */
const STALE_MS = 6 * 60_000;

// GET ?since=N: the mission and its events from seq N on. Viewers poll it while the mission runs.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!validMissionId(id)) return Response.json({ error: "bad mission id" }, { status: 400 });
  const since = Math.max(0, Math.floor(Number(new URL(req.url).searchParams.get("since")) || 0));
  const store = missionStore();
  const mission = await store.get(id);
  if (!mission) return Response.json({ error: "No such mission (it may have been recorded on another server)." }, { status: 404 });
  const { events, next } = await store.events(id, since);
  if (mission.status === "running" && Date.now() - mission.updatedAt > STALE_MS) mission.status = "stopped";
  return Response.json({ mission, events, next } satisfies MissionView);
}
