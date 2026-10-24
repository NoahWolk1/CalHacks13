// Tiny fetch helpers with timeouts + an in-process cache so repeat demo runs are instant.

const cache = new Map<string, { at: number; data: unknown }>();
const TTL = 10 * 60_000;

const UA = "GeoAgents/0.1 (CalHacks 13 hackathon project)";

export async function getJson<T = unknown>(url: string, opts: { timeoutMs?: number; signal?: AbortSignal; init?: RequestInit } = {}): Promise<T> {
  return (await cached(url, opts, (r) => r.json())) as T;
}

export async function getText(url: string, opts: { timeoutMs?: number; signal?: AbortSignal; init?: RequestInit } = {}): Promise<string> {
  return (await cached(url, opts, (r) => r.text())) as string;
}

export async function getBuffer(url: string, opts: { timeoutMs?: number; signal?: AbortSignal } = {}): Promise<ArrayBuffer> {
  return (await cached(url, opts, (r) => r.arrayBuffer())) as ArrayBuffer;
}

async function cached(url: string, opts: { timeoutMs?: number; signal?: AbortSignal; init?: RequestInit }, read: (r: Response) => Promise<unknown>) {
  const key = url + (opts.init?.body ? String(opts.init.body) : "");
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.data;
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
      cache.set(key, { at: Date.now(), data });
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

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
