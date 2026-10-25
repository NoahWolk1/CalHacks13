// Apify Actor: SF Planning public notices + hearings, geocoded with the city's address registry.
// 1. GET sfplanning.org's public notices table (one static HTML page, ~100 active projects).
// 2. Parse each row: address, record number/type, notice type, notice + plans PDFs, neighborhood, dates.
// 3. Geocode addresses in batches against DataSF's Enterprise Addressing System (SoQL `address in (...)`).
// 4. Filter by neighborhood / notice type / bbox / radius / upcoming, push to the default dataset.

import { Actor, log } from "apify";
import { EAS_URL, NOTICES_URL, easAddress, filterNotices, parseNotices } from "./parse.js";

const UA = "Mozilla/5.0 (compatible; sf-planning-notices Apify actor; +https://apify.com)";

async function fetchText(url) {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html,application/json" }, signal: AbortSignal.timeout(20_000) });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText} from ${new URL(url).host}`);
      return await res.text();
    } catch (e) {
      if (attempt >= 2) throw e;
      log.warning(`Retrying ${new URL(url).host}: ${e.message}`);
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
    }
  }
}

async function geocode(rows) {
  const keys = [...new Set(rows.map((r) => easAddress(r.address)).filter(Boolean))];
  const found = new Map();
  for (let i = 0; i < keys.length; i += 40) {
    const batch = keys.slice(i, i + 40);
    const where = `address in (${batch.map((k) => `'${k.replace(/'/g, "''")}'`).join(",")})`;
    const url = `${EAS_URL}?${new URLSearchParams({ $select: "address,longitude,latitude,nhood,supname", $where: where, $limit: "500" })}`;
    try {
      for (const a of JSON.parse(await fetchText(url))) if (!found.has(a.address)) found.set(a.address, a);
    } catch (e) {
      log.warning(`EAS geocode batch failed: ${e.message}`);
    }
  }
  let hits = 0;
  const out = rows.map((r) => {
    const a = found.get(easAddress(r.address));
    if (!a) return { ...r, lat: null, lng: null };
    hits++;
    return { ...r, lat: Number(a.latitude), lng: Number(a.longitude), analysisNeighborhood: a.nhood ?? null, supervisor: a.supname ?? null };
  });
  log.info(`Geocoded ${hits}/${rows.length} addresses via DataSF EAS`);
  return out;
}

await Actor.init();
try {
  const input = (await Actor.getInput()) ?? {};
  const needsGeo = input.geocode !== false || input.bbox || input.center;
  log.info(`Fetching ${NOTICES_URL}`);
  let rows = parseNotices(await fetchText(NOTICES_URL));
  log.info(`Parsed ${rows.length} notices`);
  if (!rows.length) throw new Error("No notices parsed: the page layout may have changed");
  if (needsGeo) rows = await geocode(rows);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
  const kept = filterNotices(rows, input, today).map((r) => ({ ...r, scrapedAt: new Date().toISOString() }));
  log.info(`${kept.length} notices after filters`);
  await Actor.pushData(kept);
  await Actor.setValue("SUMMARY", { scraped: rows.length, kept: kept.length, source: NOTICES_URL, at: new Date().toISOString() });
  await Actor.exit();
} catch (e) {
  await Actor.fail(e.message);
}
