import { resolveName } from "@/lib/sky/resolve";

export const runtime = "nodejs";

// GET ?q=<name>: resolve a star, galaxy, nebula or catalog id to J2000 RA/Dec via CDS Sesame.
export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 80);
  if (q.length < 2) return Response.json({ hit: null });
  try {
    return Response.json({ hit: await resolveName(q, req.signal) }, { headers: { "cache-control": "public, max-age=86400" } });
  } catch (e) {
    return Response.json({ hit: null, error: (e as Error).message.slice(0, 120) }, { status: 502 });
  }
}
