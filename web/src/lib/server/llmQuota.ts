// Caps Claude-powered runs on the public deployment: per client IP and globally, per rolling hour.
// Over the cap the run still happens, in heuristic mode. Counters live in Convex (convex/llm.ts)
// so the caps hold across serverless instances; without Convex an in-memory limiter is used.
//
// Env: LLM_PER_IP_HOURLY (default 20), LLM_GLOBAL_HOURLY (default 150), LLM_IP_SALT,
//      LLM_RATE_LIMIT=off|on (default: on in production, off in dev).
import { createHash } from "node:crypto";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../convex/_generated/api";
import { llm } from "@/lib/llm";


const WINDOW_MS = 60 * 60 * 1000;
const RESERVE_TIMEOUT_MS = 3000;
const num = (v: string | undefined, d: number) => (v && Number.isFinite(+v) && +v >= 0 ? Math.floor(+v) : d);

export type LlmDecision = { llm: boolean; limited: boolean };

function enabled() {
  const flag = process.env.LLM_RATE_LIMIT?.toLowerCase();
  if (flag === "off") return false;
  if (flag === "on") return true;
  return process.env.NODE_ENV === "production";
}

export function clientIp(req: Request) {
  const xff = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return xff || req.headers.get("x-real-ip")?.trim() || "local";
}

export const hashIp = (ip: string) =>
  createHash("sha256").update(`${process.env.LLM_IP_SALT ?? "geoswarm-llm-quota-v1"}:${ip}`).digest("hex").slice(0, 32);

// Per-instance fallback (SSE mode without Convex, or Convex unreachable).
const g = globalThis as unknown as { __geoswarmLlmUsage?: { ipHash: string; at: number }[] };
const mem = (g.__geoswarmLlmUsage ??= []);
function reserveInMemory(ipHash: string, perIp: number, global: number) {
  const since = Date.now() - WINDOW_MS;
  while (mem.length && mem[0].at < since) mem.shift();
  if (mem.length >= global) return false;
  if (mem.filter((r) => r.ipHash === ipHash).length >= perIp) return false;
  mem.push({ ipHash, at: Date.now() });
  return true;
}

/** Decides whether this run may use Claude, recording it against the caps if so. */
export async function decideLlm(req: Request, convexUrl: string): Promise<LlmDecision> {
  if (!llm()) return { llm: false, limited: false };
  if (!enabled()) return { llm: true, limited: false };
  const perIp = num(process.env.LLM_PER_IP_HOURLY, 20);
  const global = num(process.env.LLM_GLOBAL_HOURLY, 150);
  const ipHash = hashIp(clientIp(req));

  let allowed: boolean | undefined;
  if (convexUrl) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const r = await Promise.race([
        new ConvexHttpClient(convexUrl).mutation(api.llm.reserve, { ipHash, perIp, global }),
        new Promise<never>((_, rej) => { timer = setTimeout(() => rej(new Error("timeout")), RESERVE_TIMEOUT_MS); }),
      ]);
      allowed = r.allowed;
    } catch (e) {
      console.error("[llm-quota] Convex reserve failed, using in-memory limiter:", (e as Error).message);
    } finally { clearTimeout(timer); }
  }
  allowed ??= reserveInMemory(ipHash, perIp, global);
  if (!allowed) console.info(`[llm-quota] cap reached (ip ${ipHash.slice(0, 8)}); heuristic run`);
  return { llm: allowed, limited: !allowed };
}
