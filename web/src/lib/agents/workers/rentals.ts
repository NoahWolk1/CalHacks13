import type { Worker } from "@/lib/types";
import { getText } from "@/lib/http";
import { bboxIntersects } from "./kit";
import { inRegion, regionAreaKm2 } from "@/lib/geo";

// Short-term rentals from Inside Airbnb (public quarterly scrapes of Airbnb, CC BY 4.0, no key).
// Uses the per-city "visualisations/listings.csv" summary file; the latest snapshot URL is read from
// the get-the-data page, with a pinned fallback.
const INDEX = "https://insideairbnb.com/get-the-data/";
const CITIES: { slug: string; label: string; bbox: [number, number, number, number]; fallback?: string }[] = [
  { slug: "united-states/ca/san-francisco", label: "San Francisco", bbox: [-122.52, 37.70, -122.35, 37.84], fallback: "2026-09-14" },
  { slug: "united-states/ca/oakland", label: "Oakland", bbox: [-122.36, 37.69, -122.11, 37.89] },
  { slug: "united-states/ca/san-mateo-county", label: "San Mateo County", bbox: [-122.53, 37.10, -122.08, 37.71] },
  { slug: "united-states/ca/santa-clara-county", label: "Santa Clara County", bbox: [-122.21, 36.89, -121.20, 37.49] },
  { slug: "united-states/ca/los-angeles", label: "Los Angeles", bbox: [-118.95, 33.70, -117.65, 34.82] },
  { slug: "united-states/ca/san-diego", label: "San Diego", bbox: [-117.60, 32.53, -116.08, 33.51] },
  { slug: "united-states/ny/new-york-city", label: "New York City", bbox: [-74.26, 40.49, -73.70, 40.92] },
  { slug: "united-states/wa/seattle", label: "Seattle", bbox: [-122.44, 47.49, -122.24, 47.74] },
  { slug: "united-states/il/chicago", label: "Chicago", bbox: [-87.94, 41.64, -87.52, 42.03] },
  { slug: "united-states/ma/boston", label: "Boston", bbox: [-71.19, 42.22, -70.98, 42.40] },
];

interface Row { id: string; name: string; host: string; hostId: string; hostCount: number; room: string; price: number | null; minNights: number; reviewsLtm: number; avail: number; license: string; lng: number; lat: number }

export const rentalsWorker: Worker = {
  id: "short-term-rentals",
  name: "Night Shift",
  description: "Counts Airbnb short-term rentals in the area (Inside Airbnb): listings per km², entire-home share, median nightly price, commercial multi-listing hosts and registration status: a read on housing pressure and tourism.",
  vehicle: "car",
  color: "#e6b98f",
  tools: ["http_get"],
  dataSources: ["Inside Airbnb listings snapshot"],
  coverage: "SF Bay Area, LA, San Diego, NYC, Seattle, Chicago, Boston",
  builtin: true,
  async run({ task, emit, log, signal }) {
    const r = task.region;
    const cities = CITIES.filter((c) => bboxIntersects(r.bbox, c.bbox));
    if (!cities.length) { log("No Inside Airbnb city snapshot covers this area."); return; }
    const index = await getText(INDEX, { signal, timeoutMs: 12_000 }).catch(() => "");
    const rows: Row[] = [];
    const used: { label: string; date: string; url: string }[] = [];
    for (const c of cities) {
      const m = [...index.matchAll(new RegExp(`https://data\\.insideairbnb\\.com/${c.slug}/(\\d{4}-\\d{2}-\\d{2})/visualisations/listings\\.csv`, "g"))].map((x) => x[1]).sort();
      const date = m[m.length - 1] ?? c.fallback;
      if (!date) { log(`${c.label}: no snapshot found`); continue; }
      const url = `https://data.insideairbnb.com/${c.slug}/${date}/visualisations/listings.csv`;
      log(`Loading ${c.label} listings (${date})…`);
      const csv = await getText(url, { signal, timeoutMs: 25_000 }).catch((e) => { log(`${c.label}: ${(e as Error).message}`); return ""; });
      if (!csv) continue;
      used.push({ label: c.label, date, url });
      rows.push(...parseListings(csv).filter((x) => inRegion(r, x.lng, x.lat)));
    }
    if (!used.length) return;
    const src = used[0];
    const km2 = regionAreaKm2(r);
    log(`${rows.length} listings inside the area`);
    if (!rows.length) {
      emit({ claim: `No Airbnb listings inside this area (Inside Airbnb, ${src.label} snapshot ${src.date})`, geometry: { type: "Point", coordinates: r.center }, source_url: "https://insideairbnb.com/get-the-data/", source_type: "inside_airbnb", observed_at: src.date, confidence: 0.8, category: "str", severity: 0.05, props: { areaLevel: true, listings: 0 } });
      return;
    }
    const entire = rows.filter((x) => x.room === "Entire home/apt");
    const short = rows.filter((x) => x.minNights < 30);
    const active = rows.filter((x) => x.reviewsLtm > 0);
    const commercial = rows.filter((x) => x.hostCount >= 2);
    const registered = rows.filter((x) => /^STR-|^\d{5,}|^[A-Z]{2,4}-?\d{4,}/i.test(x.license));
    const noLicense = short.filter((x) => !x.license);
    const prices = rows.map((x) => x.price).filter((p): p is number => p != null && p > 0).sort((a, b) => a - b);
    const median = prices.length ? prices[Math.floor(prices.length / 2)] : null;
    const density = rows.length / km2;
    const pct = (n: number) => Math.round((n / rows.length) * 100);
    emit({
      claim: `${rows.length} Airbnb listings (${density.toFixed(0)}/km²): ${pct(entire.length)}% entire homes, ${pct(short.length)}% bookable under 30 nights, ${pct(active.length)}% reviewed in the last year${median ? `, median $${median}/night` : ""}. ${pct(commercial.length)}% belong to hosts with 2+ listings`,
      geometry: { type: "Point", coordinates: r.center },
      source_url: "https://insideairbnb.com/get-the-data/", source_type: "inside_airbnb", observed_at: src.date, confidence: 0.85, category: "str",
      severity: +Math.min(0.9, 0.1 + Math.min(0.5, density / 200) + (entire.length / rows.length) * 0.2 + (commercial.length / rows.length) * 0.2).toFixed(2),
      props: {
        areaLevel: true, listings: rows.length, perKm2: +density.toFixed(1), entireHomeShare: +(entire.length / rows.length).toFixed(2), shortTermShare: +(short.length / rows.length).toFixed(2),
        activeShare: +(active.length / rows.length).toFixed(2), multiListingHostShare: +(commercial.length / rows.length).toFixed(2), medianPrice: median,
        registeredShare: +(registered.length / rows.length).toFixed(2), shortTermWithoutLicense: noLicense.length, snapshot: src.date, city: used.map((u) => u.label).join(", "),
      },
    });
    // Biggest operators in the area: the clearest "housing converted to hotels" signal.
    const byHost = new Map<string, Row[]>();
    for (const x of rows) byHost.set(x.hostId, [...(byHost.get(x.hostId) ?? []), x]);
    const ops = [...byHost.values()].filter((l) => l.length >= 3).sort((a, b) => b.length - a.length).slice(0, 4);
    for (const l of ops) {
      const x = l[0];
      emit({
        claim: `Host "${x.host}" runs ${l.length} listings here (${x.hostCount} citywide), ${l.filter((y) => y.room === "Entire home/apt").length} of them entire homes`,
        geometry: { type: "Point", coordinates: [x.lng, x.lat] },
        source_url: `https://www.airbnb.com/users/show/${x.hostId}`, source_type: "inside_airbnb", observed_at: src.date, confidence: 0.8, category: "str",
        severity: +Math.min(0.75, 0.3 + l.length / 30).toFixed(2), props: { host: x.host, hostId: x.hostId, listingPoints: l.map((y) => [y.lng, y.lat]), listingsHere: l.length, listingsCitywide: x.hostCount, commercialHost: true },
      });
    }
    // Sample pins: busiest short-term entire homes (most reviews in the last year).
    const sample = [...short].sort((a, b) => b.reviewsLtm - a.reviewsLtm).slice(0, 14);
    for (const x of sample) {
      emit({
        claim: `${x.room}${x.price ? ` at $${x.price}/night` : ""}: "${x.name.slice(0, 70)}", ${x.reviewsLtm} reviews in the last year, ${x.avail} nights open next year${x.license ? `, license ${x.license.slice(0, 24)}` : ", no license number listed"}`,
        geometry: { type: "Point", coordinates: [x.lng, x.lat] },
        source_url: `https://www.airbnb.com/rooms/${x.id}`, source_type: "inside_airbnb", observed_at: src.date, confidence: 0.75, category: "str",
        severity: +Math.min(0.6, 0.15 + x.reviewsLtm / 150).toFixed(2),
        props: { roomType: x.room, price: x.price, minNights: x.minNights, reviewsLtm: x.reviewsLtm, availability365: x.avail, license: x.license || null, hostListings: x.hostCount },
      });
    }
  },
};

// ─── CSV ────────────────────────────────────────────────────────────────────

function parseListings(csv: string): Row[] {
  const recs = parseCsv(csv);
  const head = recs.shift() ?? [];
  const ix = (k: string) => head.indexOf(k);
  const I = { id: ix("id"), name: ix("name"), host: ix("host_name"), hid: ix("host_id"), hc: ix("calculated_host_listings_count"), room: ix("room_type"), price: ix("price"), min: ix("minimum_nights"), ltm: ix("number_of_reviews_ltm"), avail: ix("availability_365"), lic: ix("license"), lat: ix("latitude"), lng: ix("longitude") };
  const out: Row[] = [];
  for (const f of recs) {
    const lat = +f[I.lat], lng = +f[I.lng];
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const price = f[I.price] ? +String(f[I.price]).replace(/[$,]/g, "") : null;
    out.push({
      id: f[I.id], name: f[I.name] ?? "", host: f[I.host] || "?", hostId: f[I.hid] || f[I.host] || "?", hostCount: +f[I.hc] || 1, room: f[I.room] ?? "", price: Number.isFinite(price) ? price : null,
      minNights: +f[I.min] || 1, reviewsLtm: +f[I.ltm] || 0, avail: +f[I.avail] || 0, license: (f[I.lic] ?? "").trim(), lat, lng,
    });
  }
  return out;
}

/** RFC 4180-ish: quoted fields, doubled quotes, newlines inside quotes. */
function parseCsv(s: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", q = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) {
      if (ch === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && s[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.length > 1) rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}
