# TIC 150098860 (TOI-220): follow-up of the duotransit candidate (1417.097 / 4009.601)

Analysis run 2026-11-02. It uses public data only: ExoFOP (read, not written), the NASA Exoplanet Archive, SIMBAD (Harvard mirror), Gaia DR3, and MAST (38 SPOC 2-min sectors, 29 TESS-SPOC, 39 QLP, the S4 SPOC 2-min target pixel file, and TESScut for S4 and S98). Nothing was submitted anywhere.

## Verdict: **not a new candidate.** One event is a known planet's transit and the other is an instrumental artifact

**The star is a known planet host.** TIC 150098860 is **TOI-220**, host of the confirmed sub-Neptune **TOI-220 b** (Hoyer et al. 2021, MNRAS 505, 3361). The planet has P = 10.69531 d, Rp = 3.0 R⊕, depth about 0.9 ppt and T14 about 2.1 h. Both TFOPWG and TESS give it the disposition CP. The speckle imaging (Gemini Zorro, SOAR HRCam) and the CORALIE, CHIRON and NRES spectra on ExoFOP come from that planet's follow-up. Our pipeline should have masked its transits, and it did not.

* **The S98 event (4009.601) is a transit of TOI-220 b.** The TOI ephemeris (T0 = 3966.946848 BTJD, P = 10.6953065 d) predicts a transit at **4009.7281 ± 0.001**. The 8 h search box at 4009.601 ends 1 h after that time and swallows the transit. The transit sits at the end of an orbit, just before the 4009.82–4010.03 gap.
  * A batman fit gives tc = **4009.7325 ± 0.0038** (6 ± 5 min from the prediction).
  * Fixed at that time with a 2 h box, the depth is 0.88 ± 0.15 ppt (PDCSAP), 0.86 ± 0.15 (SAP), 0.78 ± 0.15 (QLP) and 0.90 ± 0.16 (own TESScut photometry).
  * With TOI-220 b masked, the 8 h box at 4009.601 measures **0.07 ± 0.18 ppt** (PDCSAP) and **−0.02 ± 0.18** (SAP). Nothing else is there.
* **The S4 event (1417.097) is pointing jitter after a momentum dump.** It sits at orbital phase 0.59 of TOI-220 b, so it is not that planet. Five tests say it is not astrophysical:
  1. **Timing.** The flux drop begins at the momentum dump at **1416.936**, within one 1 h bin.
  2. **Jitter.** After the dump, centroid jitter jumps about 4× (from 3–4 to 10–17 millipixels) for about 0.55 d. SPOC flags many cadences in that window "manual exclude", and most of the 30-min FFIs are missing.
  3. **Flux follows the jitter.** In 1 h bins, flux anti-correlates with jitter at **r = −0.82 (SAP)**. A jitter regressor is preferred over a transit box by **ΔBIC = 73**. With jitter regressed out, the box depth falls to 0.23 ± 0.13 ppt.
  4. **Depth depends on the aperture.** The depth is **1.08 ± 0.25 ppt in the brightest 3×3 pixels, 0.86 ± 0.22 in the 18-pixel SPOC aperture, 0.57 ± 0.14 at 33 px and 0.16 ± 0.12 at 52 px.** The core pixels lose flux and the wing pixels gain it: the PSF blurred.
  5. **Other stars on the CCD see it too.** All 15 bright stars checked on camera 4, CCD 1 show the same ~3.9× jitter jump. Their SAP depths in the same box have a median of +0.33 ppt, and 10 of 14 are positive.

**Confidence.** High (>99%) that this is not a new planet:
* The S98 event is fully explained by a known transit at the predicted time.
* The S4 event fails the aperture-growth test, tracks the jitter, and is common-mode across the CCD.

The two close Gaia neighbours (39.9″ and 50.2″) cannot be the source. An eclipse of a neighbour would not make the depth *shrink* as more of the neighbour's flux enters the aperture.

## Status of each step

| # | Step | Status |
|---|---|---|
| 1 | Prior knowledge: ExoFOP target JSON, TOI list, CTOIs, NASA Exoplanet Archive, SIMBAD, Gaia DR3 (RUWE, NSS, RV, variability) for the target and both neighbours | **verified**: known TOI-220 b host (CP); 0 CTOIs; no Gaia NSS or variability entry for any of the 3 sources |
| 1 | VSX | **failed**: VizieR timed out on the CDS and CfA hosts. Gaia vari_summary was checked instead (no entry) |
| 2 | Depths in SPOC PDCSAP and SAP, TESS-SPOC, QLP and own TESScut photometry (2 apertures × 2 backgrounds) | **verified**. S4: the FFI products cannot measure the event because the FFIs are missing during it (coverage 0–38%) |
| 2 | S4 2-min TPF, per-pixel deficit and aperture-growth test | **verified**: depth falls from 1.08 to 0.16 ppt as the aperture grows |
| 3 | Flags, dumps, gaps, jitter, S4 anomaly-gap proximity, 15 same-CCD stars, 125-dump statistics | **verified** |
| 3 | Shape, duration and ρ* (batman) | **run**. S98 matches TOI-220 b. The S4 fit is degenerate and does not discriminate |
| 4 | Box search of all 38 SPOC sectors with TOI-220 b masked | **run**. The S4 event ranks only 6th of 25 local maxima above 4σ |
| 5 | Localisation | **verified** for S4 by the pixel and aperture tests. S98 is a known on-target planet (TFOP CP) |
| 6 | Alias analysis (2592.5/n) | **not needed**. There is no pair of events |

---

## 1. Prior knowledge

**ExoFOP** (`data/exofop.json`):

| Item | Value |
|---|---|
| Names | TOI-220, CD-61 1276, TYC 8897-1263-1, DTARPS-S 171 |
| `confirmed_planets` | **TOI-220 b** |
| TOI | **TOI 220.01**, TESS and TFOP disposition **CP**, alerted 2019-05-07, updated 2026-02-17 (QLP s97) |
| TOI ephemeris | T0 = 2460966.946848 ± 0.0010 BJD, P = 10.6953065 ± 0.0000060 d, depth 928 ± 22 ppm, duration 1.99 h, Rp = 2.74 R⊕, SNR 390 |
| CTOIs | none |
| Imaging | Gemini Zorro speckle (2020-01-09; Δ4.8 mag at 0.5″ at 562 nm, Δ6.8 mag at 832 nm), SOAR HRCam (2019-02-18; Δ7.5 mag at 1″) |
| Spectroscopy | CORALIE (2018), NRES (2019), CHIRON (2019–2021) |
| Contamination ratio | 0.017 |

**NASA Exoplanet Archive.** The default solution is Hoyer et al. 2021: P = 10.695264 ± 0.000086 d, T0 = 2458335.902 BJD, T14 = 2.24 h, Rp = 3.03 ± 0.15 R⊕, Mp = 13.8 ± 1.0 M⊕, b = 0.836, e = 0.03. The archive lists no other planet in the system.

**Gaia DR3** (`data/gaia_2arcmin.csv`):

| Source | Sep | G | BP−RP | ϖ [mas] | RUWE | RV [km/s] | NSS / variability |
|---|---|---|---|---|---|---|---|
| 5481210874877547904 (target) | 1.1″ (proper motion since J2000) | 10.19 | 0.96 | 11.00 | 1.08 | 26.11 ± 0.16 | none / none |
| 5481210879173429632 | 39.9″ | 13.91 | 0.69 | 0.79 | 1.16 | 38.5 ± 4.9 | none / none |
| 5481204999362790912 | 50.2″ | 18.12 | 2.62 | 2.63 | 1.00 | – | none / none |

## 2. Event depths

**Method.** I fit a trapezoid plus a quadratic baseline for each data segment within ±1 d (`measure.py`), using quality = 0 cadences only. The adopted error is σ = max(σ_white·β, σ_emp). Results are in `data/step2_archival.json`, `data/step2_own_phot.json` and `data/step4_tpf.json`.

| Event | Product | Depth [ppt] |
|---|---|---|
| **S4 1417.097, 8 h** | SPOC 2-min PDCSAP | 0.72 ± 0.13 (frac_deeper 0.000) |
| | SPOC 2-min SAP | 0.86 ± 0.22 (frac_deeper 0.034) |
| | SAP with a jitter regressor | **0.23 ± 0.13** |
| | TPF 3×3 core / 18 px SPOC aperture / 33 px / 52 px | **1.08 ± 0.25 / 0.86 ± 0.22 / 0.57 ± 0.14 / 0.16 ± 0.12** |
| | TESS-SPOC, QLP, TESScut (FFI) | not measurable: 0–38% coverage, because only 2 FFIs exist in 1416.93–1417.16 |
| **S98 4009.601, 8 h as searched** | SPOC PDCSAP / SAP | 0.20 ± 0.10 / 0.06 ± 0.11 |
| | QLP SAP | 0.78 ± 0.23 |
| | SPOC PDCSAP / SAP, **TOI-220 b masked** | **0.07 ± 0.18 / −0.02 ± 0.18** |
| | Own TESScut, r = 1.5 / 2.5 px | 0.09 ± 0.21 / 0.19 ± 0.13 |
| **S98 at the TOI-220 b time 4009.728, 2 h** | SPOC PDCSAP / SAP / QLP | **0.88 ± 0.15 / 0.86 ± 0.15 / 0.78 ± 0.15** |
| | Own TESScut, r = 1.5 / 2.5 px | 0.91 ± 0.28 / 0.90 ± 0.16 |

The sweep's S98 detection (0.65 ppt in an 8 h box) is the 0.9 ppt, 2 h TOI-220 b transit, picked up by a box offset by 3 h. The QLP box is deepest because QLP cadences run closest to the gap.

The earlier vetting measured the S4 dip in raw SAP (0.95 ± 0.16) and in TESScut photometry (0.92 ± 0.22). I agree it is in SAP. In SAP, though, it is a jitter loss that grows as the aperture shrinks. Any FFI depth inside the dip rests on only 2–3 FFIs.

## 3. Systematics (S4)

From `step3_flags.py`, `step3_excl.py`, `step3_jitter.py`, `step3_dumps.py` and `step3_neighbors.py`. Figures are in `figs/step3_*.png`.

* **Momentum dump** (flags 32 and 4) at 1416.936–1416.944. The dip starts in the next cadences.
* **Manual-exclude cadences (flag 128) cluster after the dump**, in 1416.94–1417.45. There are 4–16 per 1 h bin, against 0–2 per bin over the previous 1.7 d. Those cadences scatter ±0.02 px in both centroids and are 2–5 ppt faint.
* **Centroid jitter** (std of MOM_CENTR in 1 h bins) rises from 3–4 to 10–17 mpx at the dump and decays by about 1417.5. Even the quality = 0 cadences reach 7–17 mpx.
* **SAP flux follows the jitter, bin by bin.** The deepest bin (−1.5 ppt) is the first one after the dump. A second minimum at 1417.4 (−1.2 ppt) coincides with a second jitter peak.
  * r(flux, jitter) is −0.82 for SAP and −0.80 for PDCSAP.
  * The jitter-only model beats the box-only model by ΔBIC = 73. Box plus jitter does not improve on jitter only.
* **Pixels** (`figs/step4_tpf_S4.png`). The peak pixel loses flux and the adjacent pixels gain it: the PSF broadened. The deficit is +1.5 ppt in the brightest 40% of aperture pixels and −2.7 ppt in the fainter aperture pixels.
* **Same-CCD stars** (`data/step3_neighbors.json`). I checked the 15 brightest TIC stars (T 7.1–8.4) within 2° that have S4 SPOC 2-min data on camera 4, CCD 1.
  * Every one shows the same post-dump jitter jump: post/pre ratio **3.76–3.97**.
  * Their SAP depths in the same 8 h box are mostly positive: 10 of 14 measurable, median **+0.33 ppt**, with several at 2–4σ (0.46 ± 0.12, 0.46 ± 0.15, 0.40 ± 0.15). One star is a large-amplitude variable and was excluded.
  * These bright stars have large apertures, so their losses are smaller, as expected. The dip is common-mode.
* **Not a generic dump response.** Across 125 dumps in 38 SPOC sectors, an 8 h box starting at each dump has median SAP depth −0.14 ppt (scatter 0.27). Only 2 give ≥ 0.7 ppt, and both are the two S4 orbit-1 dumps. The jitter episode after this particular dump is what is unusual.
* **S4 anomaly gap.** The event ends about 1.2 d before the 1418.49–1421.21 shutdown, so it is not a gap-edge effect. It sits in the degraded-pointing stretch before the anomaly.

## 4. Search of all sectors

An 8 h box search of all 38 SPOC 2-min sectors, in PDCSAP with TOI-220 b masked (±0.1 d), finds 25 local maxima at ≥ 4σ (`data/step5_search.json`). The S4 event ranks only 6th (0.70 ppt, 5.2σ).

| Hit | PDCSAP depth | SAP depth | Context |
|---|---|---|---|
| S96 3932.85 | 0.67 ppt (7.7σ) | 0.19 ± 0.16 | – |
| S97 3974.25 | 0.63 | 0.33 ± 0.28 | 0.11 d from a gap |
| S1 1338.41 | 0.63 | 0.70 ± 0.17 | 0.11 d from a gap |
| S98 4017.40 | 0.51 | 0.38 ± 0.22 | 0.13 d from a gap |
| S95 3888.57 | 0.43 | −0.25 ± 0.14 | 0.17 d from a dump |

Most of these are PDC features near gaps that are weaker or absent in SAP. This star's PDCSAP has a floor of 0.4–0.7 ppt, 8 h features. With no second event, the 2592.5/n alias question does not arise.

## 5. Shape and stellar density (batman; `data/step6_fit.json`)

* **S98, with P fixed at 10.6953 d.** tc = 4009.7325 ± 0.0038, Rp/R* = 0.035 ± 0.006, b = 0.91, a/R* = 16.7, T14 = 2.4 h. This is consistent with Hoyer et al. (0.032, 0.84, 22.3, 2.24 h), given one grazing transit at a gap edge.
* **S4, with P fixed at 518 d or 2592 d.** The fits give T14 = 8.7–9.4 h, depth 0.7–1.0 ppt and ρ* = 2.8–3.2 ρ☉, against TIC's 1.31. The fits are degenerate in b versus a/R* and do not discriminate. The decisive evidence is in §3.

## 6. What would change the verdict

Nothing realistic. The S4 dip would need to persist in large apertures, but it shows 0.16 ± 0.12 ppt at 52 px, and it is common-mode on the CCD. TOI-220 b keeps transiting on its ephemeris (T0 + n × 10.6953065 d). That is already known, so no observation is recommended.

## Not checked

* VSX (VizieR down). Gaia vari_summary was checked instead.
* TTVs of TOI-220 b. The single S98 transit agrees with the ephemeris to within 6 ± 5 min.
* An individual vet of the other §4 hits (e.g. S1 1338.41).
* The S4 TOI-220 b transit at 1421.46, 0.25 d after the anomaly gap.
* The TESS data release notes for the S4 pointing behaviour.

## Pipeline note

1. **Mask known TOI and confirmed-planet transits before the single-event search.** Use the ExoFOP or TOI ephemeris, with a window of about 1.5 × T14 + 3σ(T0). Also check ExoFOP `confirmed_planets` and `tois` before promoting any candidate. This "second transit" was TOI-220 b, confirmed since 2021.
2. **Add a post-dump jitter check.** For any event starting within about 1 h after a momentum dump, compare the 1 h-binned centroid std inside the event with outside, and count the fraction of quality-128 cadences. Flag the event when the jitter ratio is above 2 or r(flux, jitter) < −0.5.
3. **Add an aperture-growth test where 2-min TPFs exist.** Measure the depth in 3×3, SPOC, +1 px and +2 px apertures. A real on-target transit keeps its depth. Here it fell 1.08 → 0.86 → 0.57 → 0.16 ppt.
4. **Treat missing FFIs as a warning sign, not just low coverage.** FFI coverage far below the 2-min coverage means the spacecraft was misbehaving.
