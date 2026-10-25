// Address → coordinates for generated agents' findings, via Nominatim, biased to the selected region.
// Nominatim's usage policy is max 1 request/second, so calls are serialized process-wide.

import type { Region } from "@/lib/types";
import { getJson, sleep } from "@/lib/http";

const GAP_MS = 1100;
let queue: Promise<unknown> = Promise.resolve();

export function geocode(address: string, region: Region): Promise<[number, number] | null> {
  const job = queue.then(async () => {
    const [minX, minY, maxX, maxY] = region.bbox;
    const pad = Math.max(maxX - minX, maxY - minY) * 0.5;
    const q = new URLSearchParams({
      q: address, format: "json", limit: "1",
      viewbox: [minX - pad, maxY + pad, maxX + pad, minY - pad].join(","), bounded: "1",
    });
    try {
      const rows = await getJson<{ lon: string; lat: string }[]>(`https://nominatim.openstreetmap.org/search?${q}`, { timeoutMs: 6000 });
      return rows[0] ? ([Number(rows[0].lon), Number(rows[0].lat)] as [number, number]) : null;
    } catch {
      return null;
    } finally {
      await sleep(GAP_MS);
    }
  });
  queue = job.catch(() => null);
  return job;
}
