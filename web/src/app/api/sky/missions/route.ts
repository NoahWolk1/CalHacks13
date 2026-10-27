import { missionStore } from "@/lib/sky/missionStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET: the 20 most recent missions (recorded Research runs on /space).
export async function GET() {
  try {
    return Response.json({ missions: await missionStore().list(20), backend: missionStore().name });
  } catch (e) {
    return Response.json({ missions: [], error: (e as Error).message.slice(0, 160) }, { status: 502 });
  }
}
