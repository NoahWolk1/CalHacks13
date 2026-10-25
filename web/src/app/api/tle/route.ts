// Tiny CelesTrak proxy with an in-memory cache. CelesTrak serves CORS, but it rate-limits and
// blocks IPs that re-download the same group too often, so every browser tab shares one fetch.
const GROUPS = new Set(["stations", "resource", "visual", "weather", "science", "active"]);
const TTL_MS = 2 * 60 * 60 * 1000; // CelesTrak updates GP data roughly every 2h
const cache = new Map<string, { at: number; body: string }>();

export async function GET(req: Request) {
  const group = new URL(req.url).searchParams.get("group") ?? "stations";
  if (!GROUPS.has(group)) return new Response("unknown group", { status: 400 });
  const hit = cache.get(group);
  if (hit && Date.now() - hit.at < TTL_MS) return tle(hit.body);
  try {
    const r = await fetch(`https://celestrak.org/NORAD/elements/gp.php?GROUP=${group}&FORMAT=tle`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    const body = await r.text();
    if (!r.ok || !body.includes("\n1 ")) throw new Error(`celestrak ${r.status}`);
    cache.set(group, { at: Date.now(), body });
    return tle(body);
  } catch (e) {
    if (hit) return tle(hit.body); // stale beats nothing
    return new Response(String(e), { status: 502 });
  }
}

function tle(body: string) {
  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
