# TIC 382198431: follow-up of the single-transit find (BTJD 2096.549, S29)

Analysis run 2026-11-02. It uses public data only: MAST (QLP light curves for 40 sectors, S1–S98; TESScut for S29 and S87; QLP S29 light curves of 15 neighbouring stars), TIC 8.2, Gaia DR3 (ESA archive), SIMBAD (CfA mirror), the AAVSO VSX API, and ExoFOP (target JSON, TOI and CTOI lists, read only). Nothing was submitted anywhere.

## Verdict: **systematic artifact.** The dip is a scattered-light background error, not a transit

The 6.4 ppt QLP dip falls at the onset of a strong scattered-light ramp in S29. In the event window the QLP background rises from about 330 to 10,000 (QLP units). Five tests show that most or all of the dip is a background error:

1. **The depth grows with aperture size.**
   * QLP: 3.28 ± 0.81 ppt in the 1.75 px aperture, 6.39 ± 1.18 in the 2.5 px aperture, 8.15 ± 1.47 in the 3.0 px aperture.
   * Our own TESScut photometry with an annulus background: 2.8 ± 0.9 ppt (4 px), 5.4 ± 1.3 (12 px), 6.4 ± 1.6 (18 px), 8.4 ± 2.2 (32 px).
   * In e⁻/s the deficit is about 0.2–0.3 e⁻/s per aperture pixel, so it scales with the pixel count, not with the starlight. Neighbours are negligible here (every Gaia source within 1′ is G ≥ 17.0, against G 13.8), so a real on-target dip would keep its depth in every aperture. The depth also changes with the background method: a column-wise background gives 2.1–4.9 ppt.
2. **The per-pixel deficit image is a large-scale gradient across the whole 21×21 cutout, not the target's PSF.**
   * A plane fits the deficit map with χ² = 106.5 over 113 pixels. Adding a target PSF term lowers χ² by only 7.
   * That term is **2.3 ± 0.9 ppt**. An injected 6.4 ppt transit is recovered by the same fit at +6.6 ppt. The QLP depth on the target is therefore excluded at about 4.5σ.
3. **Nearby stars on the same CCD dip at the same time.**
   * We checked 15 TIC stars (T 10.5–13.4) within 0.16° on camera 4, CCD 1. In the same 4 h box, 9 of 15 are positive at > 2σ and none is negative. The median is +1.96 ppt and the weighted mean +1.21 ± 0.16 ppt.
   * Fainter stars dip deeper (r(Tmag, depth) = +0.59). Converted to the target's flux, the common deficit is **3.9 ± 0.5 ppt** (χ²/dof = 19.6/14), consistent with one additive error.
   * The target's 6.4 ppt minus this common deficit leaves 2.5 ± 1.3 ppt, matching the 2.3 ± 0.9 ppt PSF term.
4. **Dips this size are as common as brightenings this size.** We box-searched all 40 QLP sectors (S1–S98) at 4 h. The search finds 18 dips and 15 brightenings at or above the event's significance, and 33 dips and 35 brightenings at least as deep (≥ 6.2 ppt). The event is not unique. The vet scanned only 16 sectors (S29 and S63–S98).
5. **The vet's "secondary" at 3679.84 (S87) behaves the same way.** It is next to a brightening of equal size at 3679.30.
   * The dip's depth grows from 1.9 ± 1.1 ppt (4 px) to 8.6 ± 3.4 ppt (37 px). The brightening grows from −2.7 to −13.5 ppt.
   * The target PSF term at 3679.84 is 1.9 ± 1.1 ppt.
   * Both are background structure during another scattered-light ramp, so they are not a second transit or a secondary eclipse.

There are no momentum dumps, quality flags, gaps or pointing changes in the event. The nearest dump is 1.23 d away. TESScut centroid jitter in/out is 0.83 and the centroid shift is (2, −4) mpx.

**Confidence.** High (≈ 95%) that the 6.4 ppt event is not a transit of this star. The QLP depth is excluded on the target at about 4.5σ, it scales with aperture area, and it is common to the stars nearby. What remains on the target's PSF, 2.3 ± 0.9 ppt, is only 2.6σ during strongly structured scattered light. Dips of that size occur as often as brightenings, so it is not evidence for a transit. A real ≈ 2 ppt (≈ 7 R⊕) transit hidden under the artifact cannot be ruled out from this one event, but nothing supports one.

## Status of each step

| # | Step | Status |
|---|---|---|
| 1 | Host: TIC 8.2, Gaia DR3 (astrometry, RUWE, IPD, NSS, vari, RV, GSP-Phot/FLAME), NSS of all 32 neighbours within 2′, SIMBAD | **verified**: single, slightly evolved F9/G0 star; no binarity indicator; no NSS or variability entry for the target or any neighbour |
| 2 | Depth in every QLP column, background-regressed QLP, own TESScut photometry (6 apertures × 3 backgrounds), re-centring | **verified**: the depth depends on aperture and background method. No SPOC or TESS-SPOC product exists (the star is too faint) |
| 3 | Flags, dumps, gaps, background, jitter; 15 same-CCD stars; cross-check with TIC 149572699 (also on S29 camera 4 CCD 1) | **verified**: scattered-light onset; common-mode dip on neighbours |
| 4 | Per-pixel deficit image, PSF and plane fits, Gaia neighbour PSFs, injection | **verified**: the deficit is a large-scale gradient. The target term is 2.3 ± 0.9 ppt; 6.4 ppt is excluded |
| 5 | All 40 QLP sectors: box search for dips and brightenings; the vet's 3679.84 "secondary" and 3679.30 brightening | **verified**: dips and brightenings occur at equal rates; the S87 pair is a background artifact |
| 6 | Shape (batman) and density; variability (Lomb–Scargle) | **run**: the fit is weak (ΔBIC 15 against flat with σ_white; red noise ignored). The density is unconstrained at P = 677 d. No coherent variability |
| 7 | ExoFOP, TOI, CTOI, VSX, SIMBAD | **run**: nothing known. VizieR was down on all three mirrors, so the TESS EB catalogue and VizieR VSX were not checked |

---

## 1. Host star (`data/tic.json`, `data/gaia_target.json`, `data/step1_gaia.txt`, `data/gaia_2arcmin.csv`)

| Quantity | Value |
|---|---|
| TIC 8.2 | Teff 6016 ± 122 K, R 1.469 R☉, M 1.11 M☉, logg 4.15, ρ 0.350 ρ☉, d 1055 pc, Tmag 13.426, V 14.07, DWARF, no contamination ratio |
| Gaia DR3 4759595316189704960 | G 13.82, BP−RP 0.78, ϖ 0.9125 ± 0.0132 mas (1096 pc), M_G 3.63, RUWE 1.11, astrometric_excess_noise_sig 1.56, ipd_frac_multi_peak 0, ipd_gof_harmonic_amplitude 0.013, non_single_star 0 |
| Gaia RV | 70.9 ± 4.9 km/s over 19 transits. rv_chisq_pvalue and rv_amplitude_robust are not published (too faint), so RV variability cannot be tested |
| Gaia astrophysical parameters | GSP-Phot Teff 5993 K, logg 4.12, [M/H] −0.92, R 1.57 R☉. FLAME R 1.55 R☉, M 1.12 M☉, L 2.79 L☉, age 6.4 Gyr, evolstage 387 (just past the main sequence). ESP-HS class G. DSC binary-star probability 4×10⁻⁵ |
| NSS (two-body, acceleration, non-linear spectro, VIM), vari_summary, vari_eclipsing_binary, vari_classifier | **no entry** for the target or any of the 32 Gaia sources within 2′ |
| SIMBAD (15″) | no object |

The star is a single, slightly evolved, possibly metal-poor F9/G0 star. Its high RV (71 km/s) and low GSP-Phot metallicity point to thick-disc kinematics; this is not verified. The FLAME density is 1.12/1.55³ = 0.30 ρ☉, close to the TIC's 0.35.

**Neighbours within 1′** (Gaia DR3; flux relative to the target):

| Source | Sep | G | Comment |
|---|---|---|---|
| 4759595316189704832 | 19.5″ | 19.38 | 0.5% of the target's flux |
| 4759595316188117632, 4759595277534760192, 4759595247469763840, 4759689152635103360 | 21–37″ | 19.6–20.9 | ≤ 0.4% each |
| 4759595316189704704 | 46.6″ | 17.05 | 5%, ipd_frac_multi_peak 1 |
| 4759595311894503552 | 50.2″ | 18.95 | 0.9% |
| 4759595243175023104 | 58.0″ | 17.82 | 2.5% |

None of them has an NSS or variability entry.

## 2. Event depths (`data/step2_archival.json`, `data/step2_recentre.json`, `data/step2_own_phot_S29_q0.json`)

**Method.** `measure.py`: a 4 h trapezoid at 2096.549 on a ±1 d quadratic baseline, quality = 0 cadences only (24 of 24 in-event cadences are q = 0). The adopted error is max(σ_white·β, σ_emp). The QLP S29 apertures are 1.75 / 2.5 / 3.0 px (SMALLAP / BESTAP / LARGEAP headers).

| Product (S29, 10-min) | Depth [ppt] |
|---|---|
| QLP SAP (2.5 px) | 6.39 ± 1.18 (frac_deeper 0.000) |
| QLP SAP with the QLP background regressed out | 6.73 ± 1.33 |
| QLP KSPSAP (2.5 px) | 6.41 ± 1.15 |
| **QLP KSPSAP_FLUX_SML (1.75 px)** | **3.28 ± 0.81** |
| **QLP KSPSAP_FLUX_LAG (3.0 px)** | **8.15 ± 1.47** |
| Re-centred (free tc and duration, QLP SAP) | tc 2096.559, 5.5 h, 6.59 ± 1.00 (σ_white) |

**Own TESScut photometry** (21×21 cutout, target at pixel (10.55, 10.44)):

| Background | r = 1 (4 px) | r = 2 (12 px) | r = 2.5 (18 px) | r = 3 (32 px) | r = 3.5 (37 px) |
|---|---|---|---|---|---|
| Global (faintest 30% of pixels) | 2.22 ± 1.12 | 4.11 ± 1.30 | 4.68 ± 1.45 | 5.71 ± 1.82 | 5.23 ± 1.98 |
| Local annulus (5–9 px) | 2.76 ± 0.94 | 5.36 ± 1.27 | 6.40 ± 1.62 | 8.44 ± 2.17 | 8.32 ± 2.23 |
| Column-wise | 2.06 ± 0.95 | 3.24 ± 1.58 | 3.30 ± 1.86 | 4.86 ± 2.26 | 4.34 ± 2.15 |

* The 4 px core holds 457 of about 760 e⁻/s.
* The deficit is 1.3 e⁻/s at 4 px and 6.3 e⁻/s at 32 px, roughly 0.2–0.3 e⁻/s per pixel at every radius.
* The faintest sky pixels themselves show a −4.0 e⁻/s/px feature in the event window, against a quadratic baseline, while the sky is at about 113 e⁻/s/px and rising.

A real on-target transit would give the same depth in every aperture. The background-dependent, area-proportional depth is the signature of a background error.

The vet's own checks saw this but scored it as a pass:
* "pixelphot": 3.6 ppt with a column-wise background against the pipeline's 7.2 ppt.
* "apgrowth": 3.6 ppt at 1 px and 9.0 ppt at 3 px, against an expected 3.6 ppt.

## 3. Systematics (`data/step3_flags.json`, `data/step3_neighbors_S29.json`, `data/step3_neighbors_scale_S29.json`, `data/step3_crosscheck.json`, `figs/step3_flags_main.png`, `figs/step2_window_2096.55.png`)

* **Quality flags and dumps.** All event cadences have q = 0. Within ±1 d there are 5 cadences flagged 128 and 1 flagged 4096, the nearest 0.14 d from the centre. The nearest momentum dump is 1.23 d away. There are no gaps within 3 d.
* **Scattered light.** The QLP background is flat at about −3000 (QLP units) until 2096.3, then climbs to about +14,000 by 2098. The event (2096.47–2096.63) sits at the onset of this ramp: the background spans 3415–4753 inside the 4 h box, against a sector median of −67.
* **Pointing.** The TESScut flux-weighted centroid shifts by (2.0, −4.0) mpx in the event, and the in/out jitter ratio is 0.83. The QLP SAP_X shift is 0.2 mpx. There is no pointing anomaly.
* **Same-CCD stars (QLP S29, camera 4 CCD 1, 15 stars within 0.16°, T 10.5–13.4).**

| Statistic | Value |
|---|---|
| Positive at > 2σ / negative at > 2σ | 9 / 0 |
| Median depth | +1.96 ppt |
| Weighted mean | +1.21 ± 0.16 ppt |
| T < 12 / T ≥ 12 weighted means | 0.90 ± 0.19 / 2.13 ± 0.33 ppt |
| Common deficit in units of the target's flux | **3.9 ± 0.5 ppt**, χ²/dof 19.6/14 |

  Examples: TIC 382198480 (T 12.9) 3.8 ± 1.0; TIC 382244291 (T 12.5) 3.6 ± 1.1; TIC 382244219 (T 13.0) 3.3 ± 1.1; TIC 149176118 (T 11.7) 1.06 ± 0.34 ppt.
* **Cross-check with TIC 149572699** (another sweep target on S29 camera 4 CCD 1, 2.4° away). It shows −0.2 ± 0.4 ppt at 2096.55. Its own S29 dip at 2098.32 (6.3 ppt) is absent here (−0.4 ± 1.5). The scattered-light error depends on position, so it is common to stars within about 10′ but not across the CCD.

## 4. Location (`data/step4_pixels_S29_annulus.json`, `data/step4_pixels_S29_annulus_inj6.4.json`, `figs/step4_pixels_S29_annulus.png`)

**Method.**
* For each pixel, we fit the event depth in e⁻/s after annulus background subtraction, on a ±1 d quadratic baseline.
* Per-pixel errors come from 64 slid off-event fits.
* The deficit map within 6 px (113 pixels) is fitted with a plane, a Gaussian PSF at the target (σ = 0.70 px, from the median image), and a PSF at each Gaia neighbour (G < 19.5) within 4 px.

| Model | χ² (113 px) | BIC | Target term |
|---|---|---|---|
| constant | 152.1 | 156.8 | – |
| plane | 106.5 | 120.7 | – |
| target PSF + constant | 144.8 | 154.3 | 1.29 ± 0.48 e⁻/s |
| **plane + target PSF** | **99.4** | **118.4** | **1.28 ± 0.48 e⁻/s = 2.30 ± 0.86 ppt** |
| plane + PSF at G 17.05 (46.6″) | 93.3 | 112.3 | 1.5 ± 0.4 e⁻/s = 5% eclipse of that star |
| plane + PSF at G 18.95 (50.2″) | 92.9 | 111.8 | 1.7 ± 0.5 e⁻/s = 34% eclipse |
| plane + PSF at G 15.76 (61.1″) | 96.8 | 115.7 | 1.5 ± 0.5 e⁻/s = 2% eclipse |

* The deficit map is dominated by a gradient across the cutout: the plane coefficients are 0.072 ± 0.015 e⁻/s/px plus −0.022 and +0.023 e⁻/s/px² slopes. The upper-left half shows a deficit and the lower-right half an excess.
* **Injection.** A 6.4 ppt box injected into the target's own pixels (r ≤ 2.5 px, 664 e⁻/s) is recovered at 8.91 ± 0.89 ppt, which is +6.6 above the baseline 2.30. The QLP depth would be obvious on the target if it were there, so **6.4 ppt on the target is excluded at about 4.6σ**.
* The three neighbours south-west of the target (G 15.8–19.0, 47–61″) improve χ² by 3–7 over plane + target. They sit where the gradient runs, so this is not a detection. Each would need a 2–34% eclipse.
* The 19.5″ G 19.4 neighbour has only 3.3 e⁻/s and would need a 49% eclipse (fit 1.6 ± 0.5 e⁻/s), with χ² 95.6. The vet's "99%" figure used the full 6.4 ppt.

## 5. All sectors (`data/step5_search.json`, `data/step5_rank.json`, `data/step2_own_phot_S87_3679.84.json`, `data/step2_own_phot_S87_3679.30.json`, `data/step4_pixels_S87_annulus.json`)

**Search.**
* A 4 h trapezoid on a ±1 d quadratic baseline, slid in 0.02 d steps over all 40 QLP SAP sectors (q = 0; 200-s data binned to 10 min).
* SNR is measured against each sector's robust spread of box depths, so it accounts for red noise.
* Local extrema were recorded in both signs. Box depths beyond ±200 ppt (normalisation breaks at gap edges) were removed.

| Sample | Dips ≥ event SNR (5.3) | Brightenings ≥ event SNR | Dips ≥ 6.2 ppt | Brightenings ≥ 6.2 ppt |
|---|---|---|---|---|
| All extrema | 18 | 15 | 33 | 35 |
| > 0.3 d from gaps and > 0.1 d from flagged cadences | 9 | 5 | 18 | 15 |

The event ranks 18th among dips in its own statistic. The top dips are at:

| Sector | Time | Depth [ppt] | SNR |
|---|---|---|---|
| S7 | 1491.98 | 9.0 | 9.5 |
| S9 | 1544.58 | 6.0 | 6.5 |
| S27 | 2047.52 | 26 | 6.4 |
| S65 | 3093.45 | 11.2 | 6.3 |
| S68 | 3165.79 | 7.0 | 6.0 |

The top brightenings are of matching size: S36 2289.66 (−5.8 ppt), S27 2046.92 (−24 ppt), S65 3092.97 (−10.2 ppt) and S87 3679.27 (−8.2 ppt). Many of these extrema come in dip/brightening pairs a few hours apart (S65 3092.97/3093.45, S27 2046.9/2047.5, S87 3679.3/3679.8). This star's QLP light curve is dominated by background systematics at the 5–10 ppt level, and the S29 event is one of many.

**The vet's S87 pair** (3679.84 dip, 3679.30 brightening):

| Measure | 3679.84 dip | 3679.30 brightening |
|---|---|---|
| QLP SAP | 6.54 ± 2.08 ppt (β 1.6) | −7.59 ± 1.92 ppt |
| Own photometry, annulus background, r = 1 → 3.5 px | 1.9 ± 1.1 → 3.1 → 4.0 → 6.1 → 8.2 → 8.6 ± 3.4 ppt | −2.7 → −4.8 → −8.2 → −10.3 → −12.6 → −13.5 ppt |
| Column-wise background | 1.0–4.3 ppt | – |
| Target PSF term | 1.9 ± 1.1 ppt | – |

The S87 pair has the same area-scaling signature as the S29 event. It is not a second transit or a secondary eclipse.

**Periods.** With the main event not a transit, the period question is moot. The vet's "P ≈ 677 d" assumed a real single transit.

## 6. Shape, density and variability (`data/step6_fit_QLP_S29.json`, `figs/step6_fit_QLP_S29.png`, `data/step6_var.json`)

**Transit fit.** This is a face-value batman fit to QLP SAP: circular orbit, quadratic limb darkening (0.30, 0.24), local quadratic baseline, free tc, k, b and ρ★.

| P fixed at | Depth | T14 | k (Rp) | b | ρ★ [ρ☉] (1σ / 2σ) | Δχ² at ρ_TIC = 0.35 | ΔBIC vs flat |
|---|---|---|---|---|---|---|---|
| 677 d (vet) | 6.9 ppt | 5.8 h | 0.077 (12.3 R⊕) | 0.0 | 26 (7.9–25 / 0.2–32) | 1.3 | 14.7 |
| 30 d | 6.9 ppt | 5.8 h | 0.077 | 0.0 | 1.1 (0.4–1.3 / 0.01–1.6) | 0.8 | 14.7 |

* The ΔBIC uses white noise. The red-noise rank in §5 is the relevant significance.
* The shape cannot discriminate: the catalogue density is allowed within Δχ² ≈ 1.

**Variability.** Lomb–Scargle of each QLP sector (1 h bins, quadratic removed): the highest peaks sit at the 12 d search limit or at 4.6–10 d, and their periods differ from sector to sector. Their semi-amplitudes (0.4–22 ppt) track how badly each sector is affected by scattered light (S12, S13, S27, S65 worst). There is no coherent stellar signal; the QLP variance is systematic.

## 7. Prior knowledge (`data/exofop.json`, `data/step7_exofop.txt`, `data/step7_catalogs.txt`)

| Source | Result |
|---|---|
| ExoFOP | no TOI, CTOI, confirmed planet, imaging, spectroscopy, time series or stellar companions. Names: 2MASS J05264187-5951435, UCAC4 151-005631, WISE J052641.88-595143.6 |
| TOI list (8152 lines) and CTOI list | no match |
| SIMBAD (CfA, 15″) | no object |
| AAVSO VSX API (72″) | no entries |
| VizieR (CfA 502; CDS and IUCAA timed out) | VizieR-VSX, the TESS EB catalogue (Prša+2022) and the Gaia vari classifier table were not queried. The Gaia DR3 vari tables were checked directly on the ESA archive (no entry) |

## What would change the verdict

* **A dip at the same depth in every aperture** on another TESS epoch, in data free of scattered light. The star is in the southern CVZ edge region and is re-observed most years.
* **A ground-based detection of a ≈ 2–7 ppt, 4–6 h transit**, which needs a predicted epoch first. Without a period, nothing can be scheduled.
* **Better background modelling of S29.** For example, a full-frame scattered-light model, or difference imaging against a reference built from the same orbital phase of S28/S30. This would test whether the 2.3 ± 0.9 ppt PSF residual survives. That residual is the only on-target signal left, and the §5 statistics make it unremarkable.

## Not checked

* SPOC or TESS-SPOC light curves (none exist for this Tmag 13.4 star). Year-1 ELEANOR-lite, T16, TASOC and TGLC were not downloaded; they do not cover S29.
* VizieR catalogues (VSX via VizieR, TESS EB catalogue): all mirrors were down. The AAVSO VSX API was checked instead.
* Gaia RV variability (no rv_chisq_pvalue at this magnitude) and high-resolution imaging (none on ExoFOP).
* A per-event pixel analysis of the other §5 extrema. Only the S29 event and the S87 pair were analysed at pixel level.
* The TESS data release notes for S29 scattered light.

## Pipeline note

1. **Score the aperture-growth test in both directions.** The vet passed "apgrowth" with 3.6 ppt at 1 px and 9.0 ppt at 3 px against an expected 3.6 ppt. A depth that *increases* beyond the dilution expectation means flux is missing in proportion to aperture area, which is a background error. Flag when depth(large)/depth(small) exceeds the dilution-predicted ratio by more than 2σ.
2. **Also flag when the depth depends on the background method.** Here: annulus 6.4, global 4.7, column-wise 3.3 ppt at 18 px. The vet's "pixelphot" pass already showed 3.6 against the pipeline's 7.2.
3. **Add a same-time test on nearby stars.** Fit the same box to 10–15 QLP stars within about 10′. A weighted-mean dip above 3σ, rising for fainter stars, means common-mode background. Here it is +1.21 ± 0.16 ppt, 9 of 15 > 2σ.
4. **Flag events at a scattered-light onset.** Use the QLP background slope over the box relative to its ±1 d range, or the SPOC 4096 flag where TESS-SPOC exists.
5. **Run the uniqueness and secondary scans on all sectors.** The vet used 16 of 40 QLP sectors. Here the brightening count over all 40 sectors (15 at or above the event's SNR, against 18 dips) settles it.

## Files

Scripts (run with `../.venv/bin/python -W ignore` from this folder): `step1_products.py`, `step1_download.py`, `step1_gaia.py`, `step1_tesscut.py`, `step2_look.py`, `step2_archival.py`, `step2_own_phot.py` (args: sector tc dur_h), `step3_flags.py`, `step3_neighbors.py` (args: sector tc dur_h radius_deg nmax), `step3_neighbors_scale.py`, `step3_crosscheck.py`, `step4_pixels.py` (args: sector tc dur_h; env `INJ=<ppt>` for injection), `step5_search.py`, `step5_rank.py`, `step6_fit.py` (args: author sector column P), `step6_var.py`, `step7_catalogs.py`, `step7_exofop.py`, plus `common.py`, `lcio.py` and `measure.py`.

Data (`data/`): `tic.json`, `gaia_target.json`, `gaia_2arcmin.csv`, `step1_gaia.txt`, `products.txt`, `step2_archival.json`, `step2_recentre.json`, `step2_own_phot_S29_q0.json`, `step2_own_phot_S87_3679.84.json`, `step2_own_phot_S87_3679.30.json`, `step3_flags.json`, `step3_neighbors_S29.json`, `step3_neighbors_scale_S29.json`, `step3_crosscheck.json`, `step4_pixels_S29_annulus.json`, `step4_pixels_S29_annulus_inj6.4.json`, `step4_pixels_S87_annulus.json`, `step5_search.json`, `step5_rank.json`, `step6_fit_QLP_S29.json`, `step6_var.json`, `exofop.json`, `step7_catalogs.txt`, `step7_exofop.txt`. Light curves are in `data/lc/`, cutouts in `data/tesscut/` and neighbour light curves in `data/neighbors/`.

Figures (`figs/`): `step2_window_2096.55.png`, `step2_own_phot_S29_q0.png`, `step3_flags_main.png`, `step3_flags_dip_3679.84.png`, `step3_flags_bright_3679.30.png`, `step4_pixels_S29_annulus.png`, `step4_pixels_S29_annulus_inj6.4.png`, `step4_pixels_S87_annulus.png`, `step6_fit_QLP_S29.png`.
