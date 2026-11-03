# TIC 149572699 (TYC 8892-1358-1): follow-up of the single-transit find (BTJD 3078.493, S65)

Analysis run 2026-11-02. It uses public data only: MAST (QLP light curves for 37 sectors, S1–S97; TESS-SPOC FFI light curves for 29 sectors, S1–S69; TESScut for S65, S93 and S97; QLP S65 light curves of 15 neighbouring stars), TIC 8.2, Gaia DR3 (ESA archive), SIMBAD (CfA mirror), the AAVSO VSX API, and ExoFOP (target JSON, TOI and CTOI lists, read only). Nothing was submitted anywhere.

## Verdict: **systematic artifact.** The dip and both "repeats" are scattered-light and detrending artifacts, not transits

1. **SPOC flags the event as scattered light.** Every TESS-SPOC S65 cadence within ±1 d of the event (864 of 864) carries quality flag 4096, the stray-light flag, and PDCSAP is NaN there. That is why the vet found no data at the event ("coverage 0"). QLP does not flag these cadences.
   * The TESScut sky in that window oscillates between 217 and 274 e⁻/s/px in about 0.5 d bumps.
   * The event sits in a trough between two bumps; the faint sky pixels show a −21 e⁻/s/px feature there.
2. **The depth grows with aperture size.**
   * QLP SAP gives 2.64 ± 0.43 ppt.
   * Our own TESScut photometry, annulus background: **0.55 ± 0.40 ppt in the 2 px core, which holds 47% of the starlight (1782 of about 3800 e⁻/s)**; then 1.76 ± 0.35 (7 px), 2.57 ± 0.47 (14 px), 3.11 ± 0.57 (19 px), 3.49 ± 0.70 (28 px), 3.77 ± 0.80 (39 px).
   * The deficit is 0.4–0.7 e⁻/s per pixel at every radius, so it scales with area.
   * Neighbours cannot cause this: the TIC contamination ratio is 0.006 and no Gaia source within 44″ is brighter than G 20.7. A real transit would be equally deep in the core.
3. **The per-pixel deficit is a background gradient.**
   * A plane fits the deficit map (χ² 101.6 over 113 px). Adding the target PSF improves χ² by only 6, giving a target term of **0.91 ± 0.37 ppt**.
   * An injected 2.6 ppt transit is recovered at +2.7 ppt, so **QLP's 2.64 ppt on the target is excluded at about 4.7σ**.
   * The four other stars in the cutout (T about 13–15) all dip at the same time: +8.6 ± 3.0, +20 ± 5, +9.6 ± 2.7 and +1.6 ± 1.7 ppt, corresponding to a similar 0.15–0.5 e⁻/s per pixel. On 15 QLP neighbours within 0.14° the common deficit is smaller (0.41 ± 0.13 ppt on the target's flux scale) but positive, and fainter stars dip deeper.
4. **The vet's two "repeats" are artifacts.**
   * **3841.42 (S93)** sits at the start of a scattered-light ramp: the QLP background climbs from about 0 to 100,000, and QLP flags cadences from 0.002 d after the event. Own photometry grows from 1.05 ± 0.49 ppt (4 px) to 3.54 ± 1.27 (38 px). The target PSF term is 0.38 ± 0.56 ppt.
   * **3946.64 (S97)** exists only in QLP DET_FLUX (1.90 ± 0.37), at the edge of a gap. QLP SAP gives 0.10 ± 0.27, SYS_RM 0.06 ± 0.27 and own photometry 0.13 ± 0.45 ppt.
   * The vet's "found it 2 more times" is therefore wrong. It also could not explain why the times didn't fit a single period, and these artifacts explain that.
5. **Dips this size are as common as brightenings.** A 3 h box search of all 37 QLP sectors finds 18 dips and 18 brightenings at or above the event's red-noise SNR (6.3), and 19 dips and 18 brightenings at least as deep (2.6 ppt).

There are no momentum dumps (nearest 2.31 d), gaps (nearest ends 2.3 d before) or pointing changes in the event. TESScut jitter in/out is 0.91, and the MOM_CENTR shift is (0.04, 0.34) mpx.

**Confidence.** High (≈ 95%) that this is not a planet transit. The QLP depth is excluded on the target at 4.7σ, and SPOC flags the interval as scattered light. The repeats are artifacts, and dips are as common as brightenings. What remains on the target's PSF, 0.9 ± 0.4 ppt (2.5σ), is not significant in a scattered-light-flagged interval. If it were real it would be a ≈ 5.5 R⊕ body, but nothing supports that.

## Status of each step

| # | Step | Status |
|---|---|---|
| 1 | Host: TIC 8.2, Gaia DR3 (astrometry, RUWE, IPD, NSS, vari, RV and its variability), GSP-Phot/FLAME, NSS of all neighbours within 2′, SIMBAD/GALAH RV | **verified**: single F7–F8 main-sequence star near the end of its MS phase; Gaia RV constant (p = 0.48 over 20 transits), matching GALAH; no NSS or variability entries |
| 2 | Depth in QLP SAP/DET/SYS_RM and TESS-SPOC SAP/PDCSAP (flagged and unflagged), background-regressed, own TESScut photometry (6 apertures × 3 backgrounds), re-centring | **verified**: TESS-SPOC data at the event are all flagged 4096. Own core-aperture depth is 0.55 ± 0.40 ppt; the depth depends on aperture |
| 3 | Flags, dumps, gaps, scattered light, jitter; 15 same-CCD QLP stars; cutout comparison stars | **verified**: SPOC stray-light flag; local sky trough; positive same-time dips on all cutout stars |
| 4 | Per-pixel deficit image, PSF and plane fits, Gaia neighbour PSFs, injection | **verified**: gradient; target term 0.91 ± 0.37 ppt; 2.64 ppt excluded at 4.7σ; no neighbour is preferred |
| 5 | All sectors: QLP (37) and TESS-SPOC (29) box search for dips and brightenings; the vet's 3841.42 and 3946.64 "repeats" | **verified**: equal rates; both repeats are artifacts |
| 6 | Shape (batman) and density; variability | **run**: at the vet's P = 498 d the fit needs ρ★ ≈ 40 ρ☉ (TIC 0.26 disfavoured by Δχ² = 10). The QLP 6–7 d peaks are absent in PDCSAP (≤ 0.2 ppt), so they are systematic |
| 7 | ExoFOP, TOI, CTOI, VSX, SIMBAD | **run**: nothing known. VizieR was down on all mirrors |

---

## 1. Host star (`data/tic.json`, `data/gaia_target.json`, `data/step1_gaia.txt`, `data/gaia_2arcmin.csv`, `data/step7_catalogs.txt`)

| Quantity | Value |
|---|---|
| TIC 8.2 | Teff 6244 ± 106 K, R 1.673 ± 0.068 R☉, M 1.21 M☉, logg 4.07, ρ 0.259 ρ☉, d 542 pc, Tmag 11.635, V 11.80, DWARF, contamination ratio 0.0059 |
| Gaia DR3 4758971476483252992 | G 12.00, BP−RP 0.69, ϖ 1.788 ± 0.010 mas (559 pc), M_G 3.26, RUWE 1.006, astrometric_excess_noise 0.078 mas (sig 9.1), ipd_frac_multi_peak 0, ipd_gof_harmonic_amplitude 0.028, non_single_star 0 |
| Gaia RV | 25.55 ± 1.27 km/s, 20 transits, **rv_chisq_pvalue 0.48**, rv_renormalised_gof 0.41, rv_amplitude_robust 9.6 km/s: no RV variability detected |
| Other RV | SIMBAD/GALAH DR3 (GALAH 170113002601206; Buder+2021): 25.548 ± 0.10 km/s, the same as Gaia |
| Gaia astrophysical parameters | GSP-Phot 6223 K, logg 4.02, [M/H] −0.27; FLAME R 1.68 R☉, M 1.29 M☉, L 3.81 L☉, age 3.3 Gyr, evolstage 297 (late main sequence); ESP-HS class F; DSC binary-star probability 2.4×10⁻⁴ |
| NSS (two-body, acceleration, non-linear spectro, VIM), vari_summary, vari_eclipsing_binary, vari_classifier | **no entry** for the target or any of the 36 Gaia sources within 2′ |
| SIMBAD | TYC 8892-1358-1, type `*`, no spectral type, no variability type; 4 references (GALAH, rotation, Fe/H measures) |

The two RV epochs agree, and the Gaia RV is constant over 20 transits. That argues against a stellar-mass companion on a short period, though it is not a strict limit.

**Neighbours within 1′:**

| Source | Sep | G |
|---|---|---|
| 4758971480779212672 | 14.8″ | 20.88 |
| 4758971476483348864 | 27.0″ | 20.92 |
| 4758971480779210752 | 40.1″ | 20.82 |
| **4758971618219148160** | **44.7″** | **17.56** |
| 4758971446419472512 | 47.9″ | 20.73 |
| **4758974431420854400** | **51.6″** | **18.76** |
| 4758971510843085952 | 53.6″ | 19.67 |
| **4758971618219727232** | **57.7″** | **18.75** |
| **4758974401357955200** | **58.2″** | **15.44** (RUWE 1.17) |
| 4758974435718311552 | 59.7″ | 20.25 |

None of them has an NSS or variability entry.

## 2. Event depths (`data/step2_archival.json`, `data/step2_recentre.json`, `data/step2_own_phot_S65_all.json`)

**Method.** `measure.py`: a 3 h trapezoid at 3078.493 on a ±1 d quadratic baseline, error max(σ_white·β, σ_emp). The event is at 3078.43–3078.56, so S65 orbit 1 covers it. "S65–66" in the brief refers to the sector pair the sweep searched; the event is in S65 only.

| Product (S65, 200 s) | Depth [ppt] |
|---|---|
| QLP SAP (q = 0; all 54 event cadences are q = 0 in QLP) | 2.64 ± 0.43 (frac_deeper 0.000) |
| QLP SAP, QLP background regressed out | 2.77 ± 0.45 |
| QLP DET_FLUX / SYS_RM_FLUX | 2.70 ± 0.45 / 2.61 ± 0.42 |
| Re-centred (QLP SAP) | tc 3078.498, 3.0 h, 2.69 ± 0.40 (σ_white) |
| TESS-SPOC SAP, q = 0 | **no data**: every cadence within ±1 d is flagged 4096 (stray light) |
| TESS-SPOC SAP, flagged cadences included | 1.64 ± 0.34; 1.32 ± 0.35 with the SPOC background regressed out |
| TESS-SPOC PDCSAP | NaN throughout the window |

**Own TESScut photometry** (21×21; TESScut quality is 0 throughout ±1 d; target at pixel (10.92, 10.56); PSF σ = 0.57 px):

| Background | r = 1 (2 px) | r = 1.5 (7 px) | r = 2 (14 px) | r = 2.5 (19 px) | r = 3 (28 px) | r = 3.5 (39 px) |
|---|---|---|---|---|---|---|
| Global (faintest 30%) | 0.56 ± 0.40 | 1.80 ± 0.36 | 2.63 ± 0.48 | 3.20 ± 0.58 | 3.60 ± 0.71 | 3.92 ± 0.82 |
| Local annulus | 0.55 ± 0.40 | 1.76 ± 0.35 | 2.57 ± 0.47 | 3.11 ± 0.57 | 3.49 ± 0.70 | 3.77 ± 0.80 |
| Column-wise | 0.76 ± 0.45 | 2.08 ± 0.43 | 2.92 ± 0.58 | 3.53 ± 0.72 | 4.07 ± 0.93 | 4.56 ± 1.08 |

* The deficit in e⁻/s is 1.0 (2 px), 4.9 (7 px), 8.4 (14 px), 10.6 (19 px), 12.6 (28 px) and 14.3 (39 px), i.e. about 0.4–0.7 e⁻/s per pixel.
* A real transit on this star would be about 2.6 ppt in the 2 px core as well. The measured 0.55 ± 0.40 excludes that at 5σ.
* The SPOC SAP depth (1.3–1.6 ppt, smaller aperture, SPOC's own background) sits between the two, as expected for a background error.

## 3. Systematics (`data/step3_flags.json`, `data/step3_neighbors_S65.json`, `data/step3_neighbors_scale_S65.json`, `figs/step3_flags_main.png`, `figs/step2_window_3078.49.png`)

* **Flags.**
  * QLP: all cadences within ±1 d are q = 0.
  * TESS-SPOC: all are 4096 (stray light); 41% of the sector carries this flag.
  * The nearest momentum dump is 2.31 d away. The nearest gap is 3075.97–3076.18.
* **Scattered light.**
  * In QLP SAP_BKG the event is at a local plateau (616–1025 inside the box) on a rising ±1 d background (5–95%: −605 to 2361).
  * The TESScut sky (faint pixels) shows bumps of about 0.5 d with an amplitude of about 25 e⁻/s/px. The event lies in the trough between the 3078.0 and 3078.7 bumps. The sky pixels show a −20.8 e⁻/s/px feature there against a quadratic baseline, from a level of 249 e⁻/s/px.
* **Pointing.** The TESScut centroid shifts by (0.3, −0.3) mpx, with jitter in/out 0.91. The TESS-SPOC MOM_CENTR shift is (0.04, 0.34) mpx with std ratio 0.86. There is no pointing anomaly.
* **Comparison stars in the cutout** (annulus background, r = 1.5 px; in units of each star's own flux): (13,3) rel 0.14: +8.6 ± 3.0 ppt; (4,5) rel 0.05: +20.1 ± 5.4; (4,11) rel 0.09: +9.6 ± 2.7; (18,13) rel 0.23: +1.6 ± 1.7. All are positive, and the fainter ones are deeper, corresponding to a similar 0.15–0.5 e⁻/s per pixel. The dip is additive and not specific to the target.
* **QLP neighbours** (15 stars within 0.14°, camera 4 CCD 3, T 10.2–13.5).

| Statistic | Value |
|---|---|
| Median depth | +0.89 ppt |
| Weighted mean | +0.44 ± 0.20 ppt |
| Positive at > 2σ / negative at > 2σ | 1 / 0 |
| T < 12 / T ≥ 12 weighted means | 0.29 ± 0.23 / 0.79 ± 0.36 ppt |
| r(Tmag, depth) | +0.61 |
| Equivalent deficit on the target's flux scale | 0.41 ± 0.13 ppt |

  The common component over 2.6–8′ is weaker than inside the cutout. The scattered-light structure here is local (see the gradient in §4), so the same-time test on QLP neighbours is only supportive.

## 4. Location (`data/step4_pixels_S65_annulus.json`, `data/step4_pixels_S65_annulus_inj2.6.json`, `figs/step4_pixels_S65_annulus.png`)

The method is the same as for TIC 382198431: a per-pixel box depth in e⁻/s after annulus subtraction, errors from 61 slid off-event fits, and fits within 6 px (113 pixels).

| Model | χ² | BIC | Target term |
|---|---|---|---|
| constant | 146.8 | 151.5 | – |
| plane | 101.6 | 115.7 | – |
| target PSF + constant | 139.8 | 149.2 | 2.60 ± 0.98 e⁻/s |
| **plane + target PSF** | **95.5** | **114.4** | **2.41 ± 0.98 e⁻/s = 0.91 ± 0.37 ppt** |
| plane + PSF at G 17.56 (44.7″) | 96.2 | 115.0 | 1.15 ± 0.50 e⁻/s (7% eclipse) |
| plane + PSF at G 18.76 (51.6″) | 97.9 | 116.7 | 0.93 ± 0.48 (18%) |
| plane + PSF at G 15.44 (58.2″) | 100.2 | 119.0 | 0.74 ± 0.62 (1%) |
| other neighbours within 4 px (G 17.9–19.1) | 100–101 | ≥ 118.8 | consistent with 0 |

* The deficit map is a gradient: plane 0.19 ± 0.02 e⁻/s/px, strongest along the bottom (low-y) rows of the cutout.
* No neighbour PSF is preferred over plane + target.
* **Injection.** A 2.6 ppt box in the target's pixels (r ≤ 2.5, 3415 e⁻/s) is recovered at 3.64 ± 0.36, i.e. +2.73. QLP's depth on the target is excluded at 4.7σ.
* The vet's neighbour flag (4 stars within 1′ that "could make the dip") is moot: no source shows a localised deficit, and the dip is not on the target either.

## 5. All sectors (`data/step5_search.json`, `data/step5_rank.json`, `data/step2_own_phot_S93_q0.json`, `data/step2_own_phot_S97_q0.json`, `data/step4_pixels_S93_annulus.json`, `data/step4_pixels_S97_annulus.json`, `figs/step2_window_3841.42.png`, `figs/step2_window_3946.64.png`)

**The vet's "repeats."**

| Event | Measure | Depth [ppt] |
|---|---|---|
| **3841.42 (S93)** | QLP SAP q = 0 | 3.24 ± 0.66 (coverage 0.83) |
| | QLP DET / SYS_RM | 2.46 ± 0.64 / 3.10 ± 0.67 |
| | Re-centred | 3841.435, 3.5 h, 5.2 ppt |
| | Own photometry, r = 1 → 3.5 | 1.05 ± 0.49 → 0.87 → 1.87 → 2.20 → 3.18 → 3.54 ± 1.27 |
| | **Target PSF term** | **0.38 ± 0.56** |
| **3946.64 (S97)** | QLP SAP / SYS_RM | 0.10 ± 0.27 / 0.06 ± 0.27 |
| | QLP DET_FLUX | 1.90 ± 0.37 |
| | Own photometry | 0.13 ± 0.45 (2 px) to 0.01 ± 0.90 (39 px) |
| | Target PSF term | 0.53 ± 0.39 |

* **3841.42** is at the start of the S93 scattered-light ramp: QLP flags (bit 30) begin 0.002 d after it, and the background rises from about 0 to 100,000 within 1.3 d. The QLP search also finds a −2.3 ppt brightening at 3841.19, just before the dip. This is not a transit.
* **3946.64** is a detrending artifact: DET_FLUX bends down 0.2 d before the 3946.86–3947.08 gap, while the raw flux doesn't.

**Box search** (3 h; QLP SAP in 37 sectors, TESS-SPOC SAP and PDCSAP in 29 sectors; q = 0; SNR against each sector's robust spread of box depths):

| Sample | Dips ≥ 6.3σ | Brightenings ≥ 6.3σ | Dips ≥ 2.6 ppt | Brightenings ≥ 2.6 ppt |
|---|---|---|---|---|
| QLP SAP, all | 18 | 18 | 19 | 18 |
| QLP SAP, > 0.3 d from gaps and > 0.1 d from flags | 7 | 5 | 8 | 5 |
| TESS-SPOC SAP, all (≥ 5σ / ≥ 6σ) | 15 / 8 | 9 / 5 | – | – |

* The top QLP dips away from edges are at S29 2098.32 (6.5 ppt), S69 3195.60 (3.7), S37 2322.43 (3.0), S9 1544.48 (2.4), S67 3151.41 (3.7), S67 3136.45 (3.6) and **S65 3078.51 (2.6, the event)**.
* The top brightenings are at S69 3205.88 (−4.0), S66 3122.90 (−3.4), S93 3841.19 (−2.3), S66 3109.76 (−3.2) and S88 3691.38 (−2.3).
* The event is one of about 20 extrema of either sign at this level.

**Periods.** These are moot. The three vet times (3078.49, 3841.42, 3946.64) are not a transit sequence, and no event survives.

## 6. Shape, density and variability (`data/step6_fit_QLP_S65.json`, `figs/step6_fit_QLP_S65.png`, `data/step6_var.json`)

**Transit fit.** A face-value batman fit to QLP SAP: circular orbit, LD (0.28, 0.25), local quadratic baseline, free tc, k, b and ρ★.

| P fixed at | Depth | T14 | k (Rp) | b | ρ★ [ρ☉] (1σ / 2σ) | Δχ² at ρ_TIC = 0.26 | ΔBIC vs flat |
|---|---|---|---|---|---|---|---|
| 498 d (vet) | 2.59 ppt | 3.8 h | 0.048 (8.8 R⊕) | 0.50 | ≈ 40 (> 4 / > 1.6) | **10.4** | 17.3 |
| 30 d | 2.74 ppt | 3.4 h | 0.049 | 0.0 | 5.4 (1.6–5.0 / 0.04–7.9) | 1.8 | 18.6 |

* At the long periods a single transit implies, the event is too short for this 1.7 R☉ star: the catalogue density is disfavoured by Δχ² = 10.
* At P ≈ 30 d the density would fit, but ~30 d transits would have repeated in many of the 37 sectors, and no repeat at this depth exists in clean data.
* ΔBIC uses white noise; the red-noise rank in §5 is what matters.

**Variability.**
* QLP sectors show Lomb–Scargle peaks at 6.2–7.6 d with semi-amplitudes of 0.3–1.8 ppt (S96: 6.55 d, 1.8 ppt).
* TESS-SPOC PDCSAP shows no coherent peak in any of 29 sectors (semi-amplitude ≤ 0.22 ppt, periods scattered between 0.2 and 10 d).
* The QLP peaks sit near half the 13.7 d orbit, so they are systematic. The vet's "no variability above 0.5 ppt" was right about the star.
* The ±1 d quadratic baseline absorbs any 7 d modulation; it changes by ≤ 0.2 ppt over 3 h.

## 7. Prior knowledge (`data/exofop.json`, `data/step7_exofop.txt`, `data/step7_catalogs.txt`)

| Source | Result |
|---|---|
| ExoFOP | no TOI, CTOI, confirmed planet, imaging, spectroscopy, time series or stellar companions. Names: TYC 8892-01358-1, 2MASS J05452146-6036268, UCAC4 147-006119 |
| TOI list (8152 lines) and CTOI list (5140 lines) | no match |
| SIMBAD (CfA) | TYC 8892-1358-1, no variability type; GALAH DR3 RV 25.548 km/s |
| AAVSO VSX API (72″) | no entries |
| VizieR (CfA 502; CDS and IUCAA timed out) | VizieR-VSX and the TESS EB catalogue were not queried. The Gaia DR3 vari tables were checked directly on the ESA archive (no entry) |

## What would change the verdict

* **A ≈ 2.6 ppt, 3 h dip that keeps its depth in a 2 px core aperture,** in TESS data not flagged for stray light. TESS revisits this field (camera 4) almost every year.
* **A ground-based transit**, which needs an ephemeris first. None exists.
* A stray-light-corrected reduction of S65 (e.g. difference imaging against the same orbital phase in S64/S66) that keeps a significant on-target residual. The present residual is 0.91 ± 0.37 ppt, and dips that size are as common as brightenings.

## Not checked

* SPOC 2-min data (none exist). Year-1 ELEANOR-lite, T16, TASOC and TGLC were not downloaded; they don't cover S65, S93 or S97.
* VizieR catalogues (VSX via VizieR, TESS EB catalogue): mirrors down. The AAVSO VSX API was checked instead.
* High-resolution imaging (none on ExoFOP). It is not needed, because no on-target signal remains.
* Pixel-level analysis of the other §5 extrema, such as the 6.5 ppt S29 dip at 2098.32, which TIC 382198431 on the same CCD does not share.
* TESS data release notes for S65 stray light.

## Pipeline note

1. **Treat the SPOC stray-light flag (bit 13, value 4096) as a veto, or at least a flag, for QLP events.** Here every TESS-SPOC cadence at the event carried it, while QLP's quality was 0. The vet read the flagged TESS-SPOC data as "no coverage" and stopped, instead of using QLP and noting the flag.
2. **Don't count a detrended-only dip as a repeat.** The 3946.64 "repeat" appears only in QLP DET_FLUX at a gap edge (SAP 0.10 ± 0.27). Recovery checks should require the dip in SAP, or in SYS_RM_FLUX at least.
3. **Don't count dips at a scattered-light onset or next to a flagged block as repeats.** 3841.42 starts 0.002 d before QLP's bit-30 flags and while the background climbs to 10⁵.
4. **Run the pixel photometry with flagged FFIs included when the pipeline product is flagged.** The vet's "pixelphot" did not run ("not enough clean frames"). TESScut has quality 0 throughout, and the aperture-growth test it would have run (0.55 → 3.77 ppt) is decisive.
5. **Score the aperture-growth test in both directions**, as for TIC 382198431. A depth that grows with aperture area is a background error.

## Files

Scripts (run with `../.venv/bin/python -W ignore` from this folder): `step1_products.py`, `step1_download.py`, `step1_gaia.py`, `step1_tesscut.py`, `step2_look.py` (args: tc [window]), `step2_archival.py`, `step2_own_phot.py` (args: sector tc dur_h [q0|all]), `step3_flags.py`, `step3_neighbors.py`, `step3_neighbors_scale.py`, `step4_pixels.py` (env `INJ=<ppt>` for injection), `step5_search.py` (args: product list, e.g. `QLP:SAP_FLUX TESS-SPOC:SAP_FLUX TESS-SPOC:PDCSAP_FLUX`), `step5_rank.py`, `step6_fit.py`, `step6_var.py`, `step7_catalogs.py`, `step7_exofop.py`, plus `common.py`, `lcio.py` and `measure.py`.

Data (`data/`): `tic.json`, `gaia_target.json`, `gaia_2arcmin.csv`, `step1_gaia.txt`, `products.txt`, `step2_archival.json`, `step2_recentre.json`, `step2_own_phot_S65_all.json`, `step2_own_phot_S93_q0.json`, `step2_own_phot_S97_q0.json`, `step3_flags.json`, `step3_neighbors_S65.json`, `step3_neighbors_scale_S65.json`, `step4_pixels_S65_annulus.json`, `step4_pixels_S65_annulus_inj2.6.json`, `step4_pixels_S93_annulus.json`, `step4_pixels_S97_annulus.json`, `step5_search.json`, `step5_rank.json`, `step6_fit_QLP_S65.json`, `step6_var.json`, `exofop.json`, `step7_catalogs.txt`, `step7_exofop.txt`. Light curves are in `data/lc/`, cutouts in `data/tesscut/` and neighbour light curves in `data/neighbors/`.

Figures (`figs/`): `step2_window_3078.49.png`, `step2_window_3841.42.png`, `step2_window_3946.64.png`, `step2_own_phot_S65_all.png`, `step2_own_phot_S93_q0.png`, `step2_own_phot_S97_q0.png`, `step3_flags_main.png`, `step3_flags_rep_3841.42.png`, `step3_flags_rep_3946.64.png`, `step4_pixels_S65_annulus.png`, `step4_pixels_S65_annulus_inj2.6.png`, `step4_pixels_S93_annulus.png`, `step4_pixels_S97_annulus.png`, `step6_fit_QLP_S65.png`.
