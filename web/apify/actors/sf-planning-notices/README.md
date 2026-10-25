# SF Planning Notices & Hearings

Which projects near an address are about to go before San Francisco's Planning Commission? The answer sits in [one city page](https://sfplanning.org/page/public-notices-project-applications): a long HTML table with no API, no coordinates and no filters. This Actor turns that page into clean, geocoded JSON you can filter by neighborhood, bounding box or radius.

Built at Cal Hacks 13.0 for **Coordinate**. Its "Hearing Watch" agent calls this Actor to pin upcoming hearings on the map.

## What it does

1. Fetches the public notices table from sfplanning.org (about 100 active projects).
2. Parses each row: address, record number and type (`CUA` conditional use, `VAR` variance, `DRP` discretionary review, `PRJ` project…), notice type, links to the notice and plans PDFs, Planning neighborhood, and the posting, expiration and hearing dates.
3. Geocodes each address against the city's own address registry ([DataSF Enterprise Addressing System](https://data.sf.gov/resource/3mea-di5p.json)), using batched SoQL `address in (...)` queries. About 90% of rows match. The ones that don't are multi-parcel or non-address items such as "SF Survey Findings".
4. Applies your filters and writes one dataset item per notice.

## Input

| Field | Type | Default | Notes |
|---|---|---|---|
| `neighborhoods` | string[] | `[]` | e.g. `["Mission", "Castro Upper Market"]` (substring match) |
| `bbox` | `[minLng, minLat, maxLng, maxLat]` | – | needs geocoding |
| `center` + `radiusKm` | `[lng, lat]`, number | –, 1 | sorted nearest first, adds `distanceKm` |
| `noticeTypes` | string[] | `[]` | e.g. `["Hearing", "Variance", "311"]` |
| `upcomingOnly` | boolean | false | drops notices whose hearing or expiration date has passed |
| `geocode` | boolean | true | adds `lat`/`lng`, `analysisNeighborhood`, `supervisor` |
| `maxItems` | integer | 100 | |

Example: `{ "center": [-122.4194, 37.7599], "radiusKm": 1.5, "upcomingOnly": true }`

## Output (one item)

```json
{
  "address": "811 Valencia Street", "recordNumber": "2018-009487VAR", "recordType": "VAR",
  "noticeType": "Zoning Variance Hearing", "neighborhood": "Mission",
  "postedDate": "2026-10-07", "expirationDate": null, "hearingDate": "2026-10-28",
  "noticeUrl": "https://citypln-m-extnl.sfgov.org/SharedLinks.aspx?...", "plansUrl": "https://citypln-m-extnl.sfgov.org/SharedLinks.aspx?...",
  "lat": 37.7598, "lng": -122.4211, "analysisNeighborhood": "Mission", "supervisor": "Jackie Fielder",
  "distanceKm": 0.151, "staff": "Edgar Oropeza", "sourceUrl": "https://sfplanning.org/page/public-notices-project-applications"
}
```

`staff` is the city planner assigned to the notice, which is a public contact. Only the name is kept.

## Cost and speed

A run makes one page fetch plus 3 small DataSF queries, takes about 3 to 6 seconds, and needs 256 MB of memory. No proxies are needed: both sources are public government sites.

## Develop and deploy

```bash
npm install && node src/main.js      # local run; input from storage/key_value_stores/default/INPUT.json
npx -p apify-cli apify login         # paste your Apify API token
npx -p apify-cli apify push          # builds on the Apify platform as <your-username>/sf-planning-notices
```

The parsing helpers live in `src/parse.js` (no dependencies). Coordinate unit-tests them against a recorded copy of the page: `web/src/lib/sponsors/sponsors.test.ts`.
