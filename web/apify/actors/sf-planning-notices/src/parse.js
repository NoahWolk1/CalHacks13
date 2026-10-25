// Pure parsing + filtering helpers (no Apify / network imports) so the Coordinate app can unit-test them.

export const NOTICES_URL = "https://sfplanning.org/page/public-notices-project-applications";
export const EAS_URL = "https://data.sf.gov/resource/3mea-di5p.json"; // DataSF: Addresses (Enterprise Addressing System)

const decode = (s) =>
  s.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&apos;|&rsquo;|’/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").trim();

/** "10/21/2026" → "2026-10-21"; "N/A" → null. */
export function isoDate(s) {
  const m = String(s ?? "").match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}` : null;
}

/**
 * Parse the notices table. Returns one object per project row:
 * { address, recordNumber, recordType, noticeType, noticeUrl, plansUrl, neighborhood, postedDate, expirationDate, hearingDate, staff }
 */
export function parseNotices(html) {
  const table = html.match(/<table[^>]*id="publications"[^>]*>([\s\S]*?)<\/table>/i)?.[1] ?? "";
  const out = [];
  for (const [, tr] of table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => m[1]);
    if (cells.length < 6) continue;
    const [addrCell, typeCell, hoodCell, postedCell, expCell, hearingCell, staffCell = ""] = cells;
    const addrLines = decode(addrCell).split("\n").map((s) => s.trim()).filter(Boolean);
    const recordNumber = addrLines.find((l) => /^\d{4}-\d{6}[A-Z]{2,}/.test(l)) ?? null;
    const address = addrLines.filter((l) => l !== recordNumber).join(" ").trim();
    if (!address) continue;
    const links = [...typeCell.matchAll(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)].map((m) => ({ href: decode(m[1]), text: decode(m[2]) }));
    const noticeType = decode(typeCell.match(/<p[^>]*>([\s\S]*?)<\/p>/i)?.[1] ?? typeCell.split(/<ul/i)[0]).split("\n")[0] || null;
    out.push({
      address,
      recordNumber,
      recordType: recordNumber?.match(/[A-Z]+$/)?.[0] ?? null, // CUA conditional use, VAR variance, PRJ project, DRP discretionary review…
      noticeType,
      noticeUrl: links.find((l) => /notice/i.test(l.text))?.href ?? links[0]?.href ?? null,
      plansUrl: links.find((l) => /plans/i.test(l.text))?.href ?? null,
      neighborhood: decode(hoodCell) || null,
      postedDate: isoDate(decode(postedCell)),
      expirationDate: isoDate(decode(expCell)),
      hearingDate: isoDate(decode(hearingCell)),
      // City staff planner on the notice (a public contact); name only.
      staff: decode(staffCell).split("\n")[0] || null,
      sourceUrl: NOTICES_URL,
    });
  }
  return out;
}

const SUFFIX = { street: "ST", st: "ST", avenue: "AVE", ave: "AVE", boulevard: "BLVD", blvd: "BLVD", drive: "DR", place: "PL", court: "CT", lane: "LN", terrace: "TER", road: "RD", alley: "ALY", plaza: "PLZ", circle: "CIR", highway: "HWY", way: "WAY" };

/**
 * Project address → the city's EAS spelling ("684-688 Guerrero Street" → "684 GUERRERO ST",
 * "116 18th Avenue" → "116 18TH AVE", "40 3rd Street" → "40 03RD ST"). Multi-address rows use the first.
 */
export function easAddress(address) {
  const first = String(address).split(/,|\(|;|\band\b/i)[0].replace(/’/g, "'").trim();
  const m = first.match(/^(\d+)[A-Z]?(?:\s*-\s*\d+[A-Z]?)?\s+(.+)$/i);
  if (!m) return null;
  const words = m[2].trim().split(/\s+/);
  const last = words[words.length - 1].toLowerCase().replace(/\.$/, "");
  if (SUFFIX[last]) words[words.length - 1] = SUFFIX[last];
  const street = words.map((w) => (/^\d(st|nd|rd|th)$/i.test(w) ? `0${w}` : w).toUpperCase()).join(" ");
  return `${m[1]} ${street}`;
}

const R = 6371;
export function distanceKm([lng1, lat1], [lng2, lat2]) {
  const toR = (d) => (d * Math.PI) / 180;
  const a = Math.sin(toR(lat2 - lat1) / 2) ** 2 + Math.cos(toR(lat1)) * Math.cos(toR(lat2)) * Math.sin(toR(lng2 - lng1) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Apply the actor's input filters. `today` is "YYYY-MM-DD". */
export function filterNotices(rows, input, today) {
  const hoods = (input.neighborhoods ?? []).map((s) => s.toLowerCase().trim()).filter(Boolean);
  const types = (input.noticeTypes ?? []).map((s) => s.toLowerCase().trim()).filter(Boolean);
  let out = rows.filter((r) =>
    (!hoods.length || hoods.some((h) => (r.neighborhood ?? "").toLowerCase().includes(h))) &&
    (!types.length || types.some((t) => (r.noticeType ?? "").toLowerCase().includes(t))) &&
    (!input.upcomingOnly || (r.hearingDate ?? r.expirationDate ?? "9999") >= today));
  if (Array.isArray(input.bbox) && input.bbox.length === 4) {
    const [a, b, c, d] = input.bbox;
    out = out.filter((r) => r.lng != null && r.lng >= a && r.lng <= c && r.lat >= b && r.lat <= d);
  }
  if (Array.isArray(input.center) && input.center.length === 2) {
    out = out.filter((r) => r.lng != null).map((r) => ({ ...r, distanceKm: +distanceKm(input.center, [r.lng, r.lat]).toFixed(3) }));
    if (input.radiusKm) out = out.filter((r) => r.distanceKm <= input.radiusKm);
    out.sort((p, q) => p.distanceKm - q.distanceKm);
  }
  return out.slice(0, input.maxItems ?? 100);
}
