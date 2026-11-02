# TIC 150319068 — follow-up of a possible long-period transit candidate

Analysis run 2026-11-01 on real TESS data from MAST (light curves, TESScut) and Gaia DR3.
Nothing was submitted to ExoFOP or any other service. This is not a detection or a validation.

## Verdict: **artifact** (systematics), not planet-like

Neither event appears in raw pixel photometry. Each one appears in only one *detrended* pipeline product, and each matches a known systematic:

* **S31 (BTJD 2169.195).** Most of the 4.5 ppt SPOC depth comes from the PDC correction, not the star. SPOC SAP, QLP SAP, QLP KSPSAP and my own TESScut photometry all give **0.5–1.0 ppt (±0.3–0.4, ≈2σ)**. In the event window the PDC correction itself is **−2.7 ppt**. The event sits 0.6 d before the end of the sector, inside QLP's scattered-light flag, on an end-of-orbit ramp.
* **S89 (BTJD 3733.281).** Ingress falls in the orbit gap. The dip starts on the first cadence after the gap, which is also a momentum dump (3733.157), at the peak of a scattered-light episode. **TIC 41484019, 4.15° away on a different CCD, shows the same dip with the same timing and shape.** My own photometry with 4 background methods × 2 apertures gives **−0.3 to +1.4 ppt (±0.5–0.8)**. A 5 ppt transit injected at this epoch is recovered at 4.8 ± 0.5 ppt, so the null result is not a blind spot of the method.
* If the dips are taken at face value anyway, the joint fit gives a stellar density **16–50× the catalog value** at the two surviving periods, even with free impact parameter. A circular orbit is ruled out unless e ≳ 0.7–0.9.

The S31 SAP feature (~0.8 ppt, ~2σ) is not significant. About 1–5% of same-sized fits at other epochs in that sector are as deep or deeper.

## Status of each step

| # | Step | Status |
|---|---|---|
| 1 | Coordinates, TIC parameters, sectors, downloads | **verified** |
| 2 | Re-measure events in every reduction, explain S31 discrepancy | **verified** |
| 3 | Systematics: flags, momentum dumps, scattered light, gaps, TIC 41484019 | **verified** |
| 4 | Difference images + Gaia overlay, centroid offset | **run; localisation failed** (no significant flux loss in the pixels at either epoch, so the source cannot be pinned down) |
| 5 | Alias test P/n, n = 1..20, all data incl. S98 | **verified** (survivors n = 1, 3, only because of missing coverage) |
| 6 | Joint batman fit, free b, implied density | **run** (fit to the pipeline-detrended signal, which steps 2–3 indicate is not astrophysical) |
| 7 | Upcoming transit windows, 2027-04-19 observability | **run** |

The starter script `tic150319068_recheck.py` was **not present** in the working directory or under the home folder (searched to depth 5). The analysis was written from scratch. `tic150319068_recheck.py` is now a driver that runs all step scripts in order.

---

## 1. Target, coordinates, coverage

**TIC 8.2 (MAST):** RA **95.4369325°**, Dec **−65.4626593°** (J2000, epoch 2000). The Gaia DR3 counterpart is 5284710623527624064 (0.45″ from the TIC position). Your Gaia-ID estimate (95.46, −65.45) was **57″ off** (ΔRA·cosδ = 34.5″, ΔDec = 45.6″). Ecliptic latitude is −87.53°.

| Teff | logg | R★ | M★ | ρ★ | Tmag | Gmag | d | contratio |
|---|---|---|---|---|---|---|---|---|
| 5534 ± 120 K | 4.24 ± 0.08 | 1.235 ± 0.066 R☉ | 0.97 ± 0.12 M☉ | 0.515 ± 0.118 ρ☉ | 11.910 | 12.40 | 371.7 ± 3.2 pc | 0.021 |

**Sectors on silicon** (tess-point, which knows pointings through S134; all camera 4):
1, 3, 4, 6, 7, 8, 9, 10, 11, 13, 27, 28, 29, 30, 31, 33, 34, 36, 37, 38, 39, 62, 63, 64, 65, 66, 68, 69, 87, 89, 90, 93, 95, 96, 97, 98 (36 sectors).

* **Sectors 99–108: not observed.** tess-point lists no sector after 98, and MAST has no light curves or TESScut products past S98. Confirmed.
* TESScut also returns cutouts for S2, 12, 32, 35, 61, 67, 88 and 94. The target pixel reads ≈0 e⁻/s in all of them, so the star is off silicon there, consistent with tess-point.
* Downloaded: 21 TESS-SPOC FFI LCs (S1–S39), 35 QLP LCs (all sectors except S3), and 25×25 TESScut cutouts for S31 and S89. No 2-min SPOC data exist. Products are in `data/`.

## 2. Event depths in every reduction

Model: 7.2 h trapezoid at the fixed epoch, plus a quadratic (and cubic) baseline fitted separately for each contiguous data segment within ±1 d. Error is σ_adopt = max(σ_white × β_Pont, σ_emp), where σ_emp is the robust scatter of the same fit slid across the rest of the sector (~190–240 trials). Only quality = 0 cadences are used.

| Event | Product | Depth (quad) [ppt] | Depth (cubic) [ppt] |
|---|---|---|---|
| S31 2169.195 | TESS-SPOC **PDCSAP** | **3.55 ± 0.91** | 3.85 ± 0.95 |
| | TESS-SPOC SAP | 0.82 ± 0.41 | 0.98 ± 0.42 |
| | QLP SAP | 0.74 ± 0.33 | 0.72 ± 0.35 |
| | QLP KSPSAP | 0.63 ± 0.32 | 0.58 ± 0.35 |
| | Own TESScut, r = 1.5 px | 0.83 ± 0.37 | 0.99 ± 0.37 |
| | Own TESScut, r = 2.5 px | 0.65 ± 0.37 | 0.75 ± 0.36 |
| S89 3733.281 | QLP **DET_FLUX** | **4.73 ± 0.64** | 4.80 ± 0.69 |
| | QLP SAP | 0.74 ± 0.63 | 1.16 ± 0.68 |
| | Own TESScut, r = 1.5 px | −0.24 ± 0.53 | −0.52 ± 0.55 |
| | Own TESScut, r = 2.5 px | 0.48 ± 0.59 | 0.44 ± 0.62 |

**Background-method test** (own photometry, global, annulus-clipped, annulus 25th percentile, sky-plane fit × r = 1.5/2.5 px):
* S31: 0.45–0.89 ppt
* S89: −0.29 to +1.37 ppt

`data/step2_bkgtest.json`

**Injection–recovery** (5 ppt, 7.2 h injected into own r = 1.5 px photometry):

| Sector | Recovered | Above native | With ±1.2 h timing error |
|---|---|---|---|
| S31 | 5.82 ± 0.39 ppt | +5.00 | 3.8–3.9 ppt above native |
| S89 | 4.77 ± 0.53 ppt | +5.01 | 2.5–3.5 ppt above native |

A real 5 ppt event at either epoch would have been seen at ≳9σ.

**Mid-time scan** (±0.5 d, `figs/depth_vs_tc.png`): the deepest dip in any non-detrended series is 1.9 ppt. Only PDCSAP (S31, max 3.9) and DET_FLUX (S89, max 5.9) show deep dips.

**Why SPOC shows 4.51 ppt and QLP 0.69 ppt in S31.** The difference is PDC. The ratio PDCSAP/SAP in the event window is **−2.70 ppt**, against +0.29 and −0.25 ppt on either side (`figs/s31_pdc_correction.png`). PDC-MAP's cotrending correction in S31 is noisy and has similar dips before each momentum dump (2150.9, 2165.4). It adds ~2.7 ppt on top of the ~0.8 ppt SAP feature. My PDCSAP fit gives 3.6–3.9 ± 0.9 ppt, compatible within 1σ with the pipeline's 4.51 ± 0.64 (the difference is down to fitting choices). QLP measures the SAP-level feature, and my 0.63 ± 0.32 ppt in KSPSAP matches its 0.69 ppt. Crowding corrections can't explain it: CROWDSAP = 0.982 and FLFRCSAP = 0.714 change depths by <2%.

## 3. Systematics around both events

| | S31, event 2169.045–2169.345 | S89, event 3733.131–3733.431 |
|---|---|---|
| Position in sector | 0.6 d before sector end (2169.94), on the end-of-orbit SAP ramp | Nominal ingress (3733.131) is **inside** the orbit gap 3732.944–3733.155; the dip starts on the first post-gap cadence |
| Momentum dumps | QLP flags one at **2168.858** (0.19 d before ingress); SPOC FFI desats at 2150.92 and 2165.40 | **3733.157**, at the end of the gap and the start of the dip (q = 32) |
| Scattered light | QLP Straylight2 flag (4096) on **2168.32–2169.94**, covering the whole event | Scattered-light peak: background 75 → 88 e⁻/s/px; background/star in r = 1.5 px is 0.28. A 2% local background error is enough for 5 ppt |
| Other flags | SPOC: none in ±1.5 d | QLP bit 30 (internal) on 3731.89–3733.19 |
| Pointing | No centroid feature (`figs/centroid_s31.png`) | Row centroid jumps 0.25″ across the gap/dump (`figs/centroid_s89.png`) |

**TIC 41484019** (Tmag 12.19, 4.15° away, camera 4 CCD 1, while the target is on CCD 2) shows a dip in QLP DET_FLUX of **−8.7 ppt** over 3733.16–3733.42. The target's dip over the same interval is −4.9 ppt. Both start at the momentum dump/gap end and recover abruptly at ~3733.4 (`figs/s89_target_vs_TIC41484019.png`). The "separate dip at 3733.51" reported for that star is the same post-gap feature: it recovers by ~3733.45–3733.6. Two unrelated stars on different CCDs, with the same start time and shape, is the signature of a common-mode systematic. My own pixel photometry and an in-cutout comparison star show nothing at this time (comparison 0.2 ± 0.9 ppt).

## 4. Difference images and Gaia neighbours

**Method:** each pixel's time series in ±1 d is fitted with the same baseline + trapezoid model. The trapezoid amplitude (out-of-transit minus in-transit, detrended) gives a per-pixel depth image. Its centroid is fitted with a Gaussian PSF whose width is fixed from the direct image, and errors come from a 500-draw parametric bootstrap. Gaia DR3 positions are propagated to each epoch's date and tied to the target's PSF position. The WCS-to-PSF offset was 1.9″ (S31) and 0.6″ (S89). An earlier plain in-minus-out mean was discarded because it picked up the baseline ramps.

| Epoch | Depth in r = 2.5 px | Image SNR | Centroid offset from target | Status |
|---|---|---|---|---|
| S31 | 0.67 ± 0.33 ppt | 2.0 | **13 ± 20″** (0.6σ) | consistent with target, but cannot exclude any star within ~40″ |
| S89 | 0.48 ± 0.67 ppt | 0.7 | **20 ± 52″** (0.4σ) | unconstrained, because there is no flux loss in the pixels |

**Result: failed to localise.** The pixels show no significant flux loss at either epoch, so no star can be identified as the source. Figures: `figs/diffimage_s31.png`, `figs/diffimage_s89.png`.

**Gaia DR3 within 2′:** 100 sources (checked with an ADQL `COUNT(*)`). Below are the nearest neighbour and every star with G < 17.5; only stars this bright, or the nearest one, matter for a 5 ppt signal. ΔG is relative to the target's G = 12.40.

| Sep | G | ΔG | Eclipse depth needed to give 5 ppt |
|---|---|---|---|
| 18.0″ | 18.56 | 6.16 | >100%, so **impossible** |
| 36.3″ | 17.46 | 5.06 | ~53% |
| 47.6″ | 16.10 | 3.70 | ~16% |
| 58.4″ | 17.03 | 4.63 | ~36% |
| 60.7″ | 16.45 | 4.06 | ~21% |
| 73.7″ | 15.70 | 3.31 | ~10% |
| 75.1″ | 16.78 | 4.38 | ~29% (RUWE 2.28) |
| 82.1″ | 16.22 | 3.83 | ~18% |
| 95.6″ | 16.83 | 4.43 | ~30% |
| 106.7″ | 15.64 | 3.24 | ~10% |
| 109.7″ | 15.87 | 3.47 | ~13% |
| 112.0″ | 16.38 | 3.98 | ~20% |

Fainter stars within 30″ cannot produce 5 ppt. List: `data/gaia_2arcmin.csv`.

## 5. Alias test, P/n for n = 1..20

This uses all 56 light curves through S98 and assumes a 5 ppt, 7.2 h dip at T = 2169.195 + k·P (σ_Tc = 0.02 d per event).

* An epoch counts as **excluded** if the median over products of depth + 3σ is < 5 ppt, using only quality = 0 cadences with ≥50% in-transit coverage.
* Epochs covered only by flagged cadences are listed but are **not** used to exclude a period.

| n | P [d] | Epochs in good data | 5 ppt excluded | Dip present | Ambiguous | Flagged-only | Survives |
|---|---|---|---|---|---|---|---|
| 1 | 1564.086 | 0 | 0 | 0 | 0 | 0 | **YES** |
| 2 | 782.043 | 1 | 1 | 0 | 0 | 0 | no |
| 3 | 521.362 | 0 | 0 | 0 | 0 | 0 | **YES** |
| 4 | 391.021 | 1 | 1 | 0 | 0 | 0 | no |
| 5 | 312.817 | 1 | 1 | 0 | 0 | 1 | no |
| 6 | 260.681 | 1 | 1 | 0 | 0 | 1 | no |
| 7 | 223.441 | 3 | 3 | 0 | 0 | 0 | no |
| 8 | 195.511 | 3 | 3 | 0 | 0 | 0 | no |
| 9 | 173.787 | 3 | 3 | 0 | 0 | 1 | no |
| 10 | 156.409 | 4 | 4 | 0 | 0 | 1 | no |
| 11 | 142.190 | 4 | 3 | 0 | 1 | 1 | no |
| 12 | 130.340 | 4 | 4 | 0 | 0 | 2 | no |
| 13 | 120.314 | 6 | 6 | 0 | 0 | 0 | no |
| 14 | 111.720 | 7 | 7 | 0 | 0 | 1 | no |
| 15 | 104.272 | 7 | 7 | 0 | 0 | 1 | no |
| 16 | 97.755 | 9 | 9 | 0 | 0 | 0 | no |
| 17 | 92.005 | 9 | 9 | 0 | 0 | 2 | no |
| 18 | 86.894 | 6 | 6 | 0 | 0 | 3 | no |
| 19 | 82.320 | 10 | 10 | 0 | 0 | 2 | no |
| 20 | 78.204 | 10 | 10 | 0 | 0 | 1 | no |

**Decisive epochs for small n** (`figs/alias_epochs_n2to8.png`):

| Epoch | Excludes | Measured depth |
|---|---|---|
| BTJD **1387.152** (S3, 2018-09-25) | n = 2, 4, 6, 8 | 0.34 ± 0.38 (SAP), 0.42 ± 0.32 ppt (PDCSAP), full coverage |
| BTJD 3107.647 (S66) | n = 5 | −0.94 ± 0.45 / −1.27 ± 0.40 ppt |
| BTJD 1498.872 (S7), 3062.958 (S64), 3956.722 (S97) | n = 7 | all flat |

Every predicted time for every n, with UTC, data coverage and per-product depths, is in `data/step5_table.md`.

**Surviving periods: 1564.086 d and 521.362 d.** They survive only because none of their predicted epochs falls in TESS data:
* n = 3 epochs at 1647.8, 2690.6 and 3211.9 hit S12 (off silicon), an unobserved stretch, and the gap after S69.

This test assumes 5 ppt. If the true depth were the ~0.8 ppt seen in SAP, single epochs would only reach ~2σ and the exclusions above would not apply.

## 6. Joint transit fit for the surviving periods

**Setup:** batman with quadratic limb darkening fixed at u = (0.40, 0.22), circular orbit. Free parameters: Tc1, Tc2, Rp/R★, b, log ρ★ and a jitter term per event, with per-segment quadratic baselines profiled out. emcee was run with 40 walkers × 8000 steps; 1 stuck walker was dropped per run. Data are S31 PDCSAP + S89 DET_FLUX, the only products where the dips exist, so this characterises the reported signal, not a validated transit. Figures: `figs/jointfit_n1.png`, `figs/jointfit_n3.png`.

| | n = 1 | n = 3 |
|---|---|---|
| P [d] | 1564.105 (+0.024 / −0.014) | 521.368 (+0.008 / −0.004) |
| Tc1 [BTJD] | 2169.167 ± 0.020 | 2169.168 ± 0.020 |
| Tc2 [BTJD] | 3733.281 (+0.012 / −0.023) | 3733.280 (+0.012 / −0.023) |
| Depth (Rp/R★)² | 4.5 (+0.7 / −0.5) ppt | 4.5 (+0.7 / −0.5) ppt |
| Rp/R★ | 0.067 (+0.005 / −0.004) | 0.067 (+0.005 / −0.004) |
| b | 0.45 ± 0.30 | 0.46 ± 0.30 |
| T14 | 6.6 (+1.2 / −0.8) h | 6.6 (+1.2 / −0.8) h |
| **ρ★ (fit)** | **26 (+22 / −16) ρ☉**, 95%: 4.7–66 | **8.5 (+7.1 / −5.0) ρ☉**, 95%: 1.3–21.6 |
| **ρ★ / ρ_catalog** | **50 (+43 / −31)** | **16 (+14 / −10)** |
| Posterior within catalog ±2σ | 0% | 0.17% |

* Free b does not reconcile the density. High b needs a V shape, which the flat-bottomed S31 PDCSAP feature disfavours.
* Matching the catalog density needs eccentricity, with the transit near periastron: e ≳ 0.86 (n = 1) or e ≳ 0.73 (n = 3) at the median ratios.
* A planet at n = 1 would have Rp ≈ 0.067 × 1.235 R☉ ≈ 0.80 R_J.
* In S89 the ingress is unobserved, which weakens the shape constraint.

## 7. Upcoming windows (2026-11-01 → 2028-10-31) and 2027-04-19

Ephemeris uncertainties are formal, from the fit. The dominant uncertainty is whether the events are real at all, which current evidence says they are not.

| Period | Transits in window | Next one after window |
|---|---|---|
| n = 1, 1564.105 d | **none** | 2029-06-09 21:14 UTC ± 0.6 h |
| n = 3, 521.368 d | **2028-01-05 12:22 UTC ± 0.5 h** (BTJD 4776.016 ± 0.021), T14 ≈ 6.6 h | 2029-06-09 21:12 UTC ± 0.6 h |

Observability of the n = 3 window on 2028-01-05 (Moon 54% illuminated):

| Site | Star altitude in transit | Transit dark (Sun < −18°) and altitude > 30° |
|---|---|---|
| Siding Spring | 38–56° | **73%** |
| Cerro Tololo | 6–34° | 0% (Sun up) |
| Sutherland | 8–27° | 0% (Sun up) |

**2027-04-19 is not a date for either surviving period.** It corresponds to **P/2 = 782.043 d**: predicted mid-transit 2027-04-19 19:45 UTC (BTJD 4515.32 ± ~0.03), ingress ~16:09, egress ~23:21 UTC. P/2 is **excluded** in step 5 by the flat S3 data at BTJD 1387.152. Observability, computed as requested:

| Site | Star altitude in transit | Sun at mid-transit | Transit dark | Dark and altitude > 30° |
|---|---|---|---|---|
| Cerro Tololo / La Silla | 33–55° | **+30° (daytime)** | 0% | 0% |
| Siding Spring | 7–21° (near lower culmination) | −10° | 41% | 0% |
| **SAAO Sutherland** | 17–56° | −46° | 81% | **48%** |

* Astronomical darkness at SAAO starts at 17:34 UTC, so mid-transit through egress plus post-egress baseline would be observable there.
* Moon: 98% illuminated, 84° from the target, above the horizon at SAAO.

## Files

* `figs/`: raw windows (`raw_window_s31.png`, `raw_window_s89.png`), the PDC correction, the TIC 41484019 comparison, own photometry and centroids, depth vs Tc, difference images, alias epochs and joint fits.
* `data/`: TIC and Gaia tables, all measurements as JSON, and the per-epoch alias table `step5_table.md`. Downloaded FITS are in `data/lc`, `data/tesscut*` and `data/lc_neighbor`.
* Scripts: `step1_*` … `step7_*`, shared modules `lcio.py` and `measure.py`, and the driver `tic150319068_recheck.py`.

## What would change the verdict

* A dip of ≳3 ppt in **SAP or own pixel photometry** at a new epoch, away from gaps, dumps and scattered light.
* A depth image whose flux loss is centred on a specific star.

The cheapest check is the 2028-01-05 n = 3 window from Australia. A null result there would also remove n = 3. P = 1564 d stays untestable by TESS until 2029-06-09.
