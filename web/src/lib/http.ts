// Tiny fetch helpers with timeouts + an in-process cache so repeat demo runs are instant.
// Successful responses are also persisted to web/.cache/http/ (Node runtime only): a copy younger
// than DISK_FRESH is served without hitting the network, and an older one is served (stale) when
// the live request fails, so flaky gov APIs can't break a demo once `npm run warm` has run.

import { createHash } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const cache = new Map<string, { at: number; data: unknown }>();
const TTL = 10 * 60_000;
const DISK_FRESH = 6 * 60 * 60_000;
// Vercel's filesystem is read-only except /tmp (per-instance, ephemeral: still saves repeat fetches).
const DISK_DIR = process.env.VERCEL ? path.join("/tmp", "geoswarm-cache", "http") : path.join(process.cwd(), ".cache", "http");
let diskWarned = false;

const UA = "GeoAgents/0.1 (CalHacks 13 hackathon project)";

type Kind = "json" | "text" | "bin";
type Opts = { timeoutMs?: number; signal?: AbortSignal; init?: RequestInit };

export async function getJson<T = unknown>(url: string, opts: Opts = {}): Promise<T> {
  return (await cached(url, opts, "json", (r) => r.json())) as T;
}

export async function getText(url: string, opts: Opts = {}): Promise<string> {
  return (await cached(url, opts, "text", (r) => r.text())) as string;
}

export async function getBuffer(url: string, opts: { timeoutMs?: number; signal?: AbortSignal } = {}): Promise<ArrayBuffer> {
  return (await cached(url, opts, "bin", (r) => r.arrayBuffer())) as ArrayBuffer;
}

async function cached(url: string, opts: Opts, kind: Kind, read: (r: Response) => Promise<unknown>) {
  const key = url + (opts.init?.body ? String(opts.init.body) : "");
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.data;
  const disk = await diskRead(key, kind);
  if (disk && Date.now() - disk.at < DISK_FRESH) {
    cache.set(key, disk);
    return disk.data;
  }
  try {
    const data = await live(url, opts, read);
    cache.set(key, { at: Date.now(), data });
    void diskWrite(key, kind, data);
    return data;
  } catch (e) {
    if (disk && !opts.signal?.aborted) {
      console.warn(`[http] live request failed (${(e as Error).message.slice(0, 80)}); serving stale disk copy (${Math.round((Date.now() - disk.at) / 60_000)} min old) for ${new URL(url).host}`);
      return disk.data;
    }
    throw e;
  }
}

async function live(url: string, opts: Opts, read: (r: Response) => Promise<unknown>) {
  // Public gov APIs (FEMA especially) drop connections intermittently: retry network errors and 5xx.
  for (let attempt = 0; ; attempt++) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), opts.timeoutMs ?? 15_000);
    const onAbort = () => ctl.abort();
    opts.signal?.addEventListener("abort", onAbort);
    try {
      const res = await fetch(url, { ...opts.init, signal: ctl.signal, headers: { "User-Agent": UA, ...(opts.init?.headers ?? {}) } });
      if (!res.ok) {
        const err = new Error(`${res.status} ${res.statusText} from ${new URL(url).host}`);
        if (res.status >= 500 && attempt < 2) throw Object.assign(err, { retry: true });
        throw err;
      }
      const data = await read(res);
      // An empty 200 (e.g. a tile CDN path that doesn't exist) must not be cached as a real answer.
      if (data instanceof ArrayBuffer && !data.byteLength) throw new Error(`empty response from ${new URL(url).host}`);
      return data;
    } catch (e) {
      const retryable = (e as { retry?: boolean }).retry || e instanceof TypeError || (e as Error).name === "AbortError";
      if (opts.signal?.aborted || !retryable || attempt >= 2) throw e;
      await sleep(400 * (attempt + 1));
    } finally {
      clearTimeout(timer);
      opts.signal?.removeEventListener("abort", onAbort);
    }
  }
}

// ─── disk cache ─────────────────────────────────────────────────────────────

const diskPath = (key: string, kind: Kind) => path.join(DISK_DIR, createHash("sha1").update(key).digest("hex") + (kind === "bin" ? ".bin" : ".json"));

async function diskRead(key: string, kind: Kind): Promise<{ at: number; data: unknown } | null> {
  const file = diskPath(key, kind);
  try {
    if (kind === "bin") {
      const [buf, st] = await Promise.all([readFile(file), stat(file)]);
      return { at: st.mtimeMs, data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
    }
    const rec = JSON.parse(await readFile(file, "utf8")) as { at: number; data: unknown };
    return typeof rec.at === "number" ? rec : null;
  } catch {
    return null;
  }
}

async function diskWrite(key: string, kind: Kind, data: unknown) {
  try {
    await mkdir(DISK_DIR, { recursive: true });
    const file = diskPath(key, kind);
    const tmp = `${file}.${process.pid}.${Math.random().toString(36).slice(2, 7)}.tmp`;
    // Write-then-rename so a concurrent reader never sees a half-written file.
    if (kind === "bin") await writeFile(tmp, Buffer.from(data as ArrayBuffer));
    else await writeFile(tmp, JSON.stringify({ at: Date.now(), url: key.slice(0, 500), data }));
    await rename(tmp, file);
  } catch (e) {
    if (!diskWarned) console.warn("[http] disk cache write failed (further failures silenced):", (e as Error).message);
    diskWarned = true;
  }
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
