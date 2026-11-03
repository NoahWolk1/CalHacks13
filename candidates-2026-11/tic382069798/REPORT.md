# TIC 382069798: follow-up of the single-transit find (BTJD 2190.255)

Analysis run 2026-11-02. It uses public data only: MAST (TESS-SPOC FFI light curves for 31 sectors, QLP for 41 sectors, TARS for S32, TESScut 21×21 px for S31–33 and 41×41 px for S32, 20 other TESS-SPOC S32 light curves on the same CCD), TIC 8.2, Gaia DR3 (ESA archive), SIMBAD (CfA mirror), the AAVSO VSX API, and ExoFOP (target JSON, TOI and CTOI lists, read only). Nothing was submitted anywhere.

## Verdict: **noise/systematic artifact.** The "dip" is a detrended flux step from one detector pixel. The star shows no transit

* **The raw aperture flux shows no dip. It shows a step.** At BTJD **2190.355** (between two 10-min cadences) the TESS-SPOC SAP flux rises by **+9.98 ppt** and stays up for the remaining 9.6 d of the sector (+7.7 to +9.5 ppt in later windows). QLP SAP shows the same step at the same cadence, +7.7 ppt in its smaller aperture.
  * Before the step the flux is flat. The 2190.15–2190.35 window, which is the first 80% of the "transit", sits at −0.34 ppt against the 2188.0–2190.3 baseline.
  * The vet's 5.4 h box ends at 2190.368, at the step. A running-median or polynomial baseline fitted across a step drags the pre-step flux below the local trend, and that is the "dip".
* **A step model explains the feature, and a transit model doesn't add anything.**
  * TESS-SPOC SAP within ±1 d: line + step has BIC 300 against 813 for line + dip.
  * With the step in the model, the box depth is **−0.12 ± 0.37 ppt** (QLP SAP +0.08 ± 0.41).
  * A batman fit with the step adds only Δχ² 4.6, so ΔBIC = −18 favours no transit. The 3σ upper limit on a 5.4 h dip is **0.98 ppt (< 2.4 R⊕)**.
  * TARS S32 photometry has no step and no dip: 0.19 ± 0.51 ppt.
* **The step is in one pixel.** A per-pixel fit of S32 TESScut puts the whole step in a single pixel: **+16.8 e⁻/s (+9.3% of that pixel's flux), z = 83**. It is cutout pixel (12,10), 1.18 px (≈ 25″) from the target along +column.
  * Every other pixel within 4 px changes by ≤ 1.2 e⁻/s (≤ 2.8σ).
  * The scan of all 1681 pixels of a 41×41 cutout finds only this one pixel with |z| > 8.
  * A real astrophysical source can't put more than 90% of its flux change in one TESS pixel. This is a detector or pixel-level event.
  * Spacecraft pointing (POS_CORR1/2) shifts by 0.09 / 4.0 mpx and the background is unchanged (537.7 vs 537.2 e⁻/s). The flux-weighted centroid (MOM_CENTR1) shifts by +12 mpx toward that pixel.
* **Every vet flag follows from that pixel:**
  * **Difference image 18″ off-target:** the dip image made without a step term has its centroid 24.9″ off-target, on the stepping pixel.
  * **QLP 1×1 vs 5×5 ratio 2.7, and TESS-SPOC 4.94 vs QLP 3.34 ppt:** the pixel is outside the smallest apertures and diluted by different amounts in larger ones. Own photometry: r = 1 px gives −0.01 ppt; r = 1.5 / 2 / 3 px give 4.96 / 4.35 / 3.08 ppt.
  * **Short ingress (0.14 h) and asymmetry:** one edge of the feature is a one-cadence step.
  * **Uniqueness (brightening at 3919.94):** in raw SAP this is a 1.3 ppt, 4.2σ box in QLP S96, part of a systematics-dominated distribution. There are 41 dips and 29 brightenings at ≥ 4σ over 42 sectors, and the S32 event ranks 9th among the dips.

## Status of each step

| # | Step | Status |
|---|---|---|
| 1 | Host: TIC 8.2, Gaia DR3 (astrometry, binarity, NSS, variability, FLAME/GSP-Phot), RV check, SIMBAD | **verified**: single K dwarf, R 0.69 R☉. The Gaia RV scatter is typical for its magnitude (§1) |
| 2 | Depth in TESS-SPOC SAP/PDCSAP, all QLP columns, TARS, own TESScut photometry; re-centred | **verified**. The dip appears only in detrended or polynomial-baseline fits; with a step term every raw product gives 0 |
| 3 | Flags, dumps, gaps, background, jitter, 20 same-CCD TESS-SPOC stars + 5 cutout stars | **verified**: no flag, dump or pointing event at the step. No other star has a step or dip |
| 4 | Location: per-pixel step and dip maps, all-pixel step scan, Gaia neighbours | **verified**: one-pixel step 25″ from the target; the neighbours show nothing |
| 5 | All sectors: box search, dips vs brightenings, step scan | **run**: no repeat matters, because there is no transit to repeat |
| 6 | batman fit with and without a step | **run**: no transit once the step is modelled (ΔBIC −18) |
| 7 | ExoFOP, TOI, CTOI, VSX, SIMBAD | **run**: nothing known for the target. VizieR (CfA) returned 502 |

---

## 1. Host star (`data/tic.json`, `data/step1_gaia.json`, `data/step1_gaia_rv.json`, `data/gaia_2arcmin.csv`)

| Quantity | Value |
|---|---|
| Names | 2MASS J05185789−5902575, Gaia DR3 4762785549177553920, GALAH 161211003101086, UCAC4 155-005390 |
| TIC 8.2 | Tmag 12.23, Teff 4857 K, logg 4.70, R 0.66 R☉, M 0.79 M☉, d 184 pc, contamination ratio 0.007 |
| Gaia DR3 astrometry | ϖ 5.432 ± 0.013 mas, μ (63.75, 94.38) mas/yr (v_tan ≈ 99 km/s), RUWE 1.11, ipd_frac_multi_peak 0, ipd_gof_harmonic_amplitude 0.006, NSS 0 |
| Gaia photometry | G 12.83, BP−RP 1.17, **M_G 6.51**: on the K-dwarf main sequence |
| Gaia FLAME / GSP-Phot | R 0.694 R☉, M 0.777 M☉, L 0.22 L☉, evolstage 101 (main sequence); Teff 4810 K, logg 4.58, [M/H] −0.35, ESP-HS type K; DSC binary probability 0.0009 |
| Gaia tables | no entry in nss_two_body_orbit, nss_acceleration_astro, nss_non_linear_spectro, vari_summary, vari_eclipsing_binary or vari_classifier_result. The same holds for all 17 neighbours with G < 18 within 2′ |
| RV | Gaia 84.41 ± 1.95 km/s (17 transits, rv_chisq_pvalue 0.144, rv_amplitude_robust 25.2 km/s); GALAH DR3 85.15 ± 0.09 km/s (SIMBAD, 2021MNRAS.506..150B) |

**The vet's "K < 27.9 km/s" is just the noise.**
* Comparison sample: 1523 Gaia DR3 stars with grvs_mag 11.8–12.0, template Teff 4500–5000 K, 12–22 transits and the same RV method.
* In that sample the median rv_amplitude_robust is 12.3 km/s and the 95th percentile is 32.5 km/s. 8.8% have ≥ 25.2 km/s, and 35% have p ≤ 0.144.
* The target is unremarkable. Its radial_velocity_error (1.95 km/s) is about twice the sample median (1.05 km/s), a weak hint at most.
* The Gaia and GALAH RVs agree within 0.4σ. Two epochs can't rule out a binary, but nothing requires one.

The high space velocity (v_tan ≈ 99 km/s, RV 85 km/s) and [M/H] −0.35 suggest a thick-disk star. That doesn't affect the verdict.

## 2. Depths (`data/step2_archival.json`, `data/step2_step.json`, `figs/step2_window_s32.png`, `figs/step2_s32_full.png`, `figs/step2_zoom_s32.png`)

The fit is a 5.4 h trapezoid at 2190.255. "Quadratic" means `measure.py` (a ±1 d quadratic baseline with red-noise errors, σ = max(σ_white·β, σ_emp)). "With step" means line + step at 2190.358 + dip.

| Product (S32) | Quadratic [ppt] | β | With step [ppt] | Step [ppt] |
|---|---|---|---|---|
| TESS-SPOC SAP | 4.92 ± 1.64 | 3.0 | **−0.12 ± 0.37** | **+9.98** |
| TESS-SPOC PDCSAP | 5.08 ± 1.45 | 2.9 | 0.67 ± 0.37 | +8.81 |
| QLP SAP | 3.70 ± 1.33 | 2.7 | **0.08 ± 0.41** | **+7.70** |
| QLP KSPSAP / SML / LAG | 3.09 / 1.56 / 2.87 | 1.3–1.7 | 1.93 / 0.49 / 0.57 | 1.2 / 1.5 / 3.7 |
| TARS | 0.19 ± 0.51 | 1.0 | −0.02 ± 0.55 | +0.26 |
| Own TESScut, r = 1 / 1.5 / 2 / 3 px | −0.01 / 4.96 / 4.35 / 3.08 | | −1.39 / −0.19 / −0.17 / −0.13 (±0.3) | 1.8 / 10.3 / 9.2 / 7.2 |

* **KSPSAP keeps a residual about 2 ppt deep.** QLP's spline detrending has already turned the sharp step into a smooth ramp, which a step term can't absorb. Every raw-flux product gives zero.
* **The quadratic depths are not significant on their own terms.** β ≈ 3 shows that the residuals are dominated by the step.
* **The vet's asymmetry isn't in the raw flux.** In raw SAP the two halves of the box are 4.77 and 4.15 ppt, about equal. The "second half 53% deeper" came from the vet's own detrending around the step.
* **The step persists for the rest of the sector** (the TESS-SPOC SAP levels above). PDCSAP partly corrects it. That partial correction is why PDCSAP shows a slow decline into the step, then a jump (`figs/step2_window_s32.png`).

## 3. Systematics (`data/step3_flags.json`, `data/step3_neighbors.json`, `data/step3_neighbors_spoc_sameccd.txt`)

* **Quality flags.** TESS-SPOC has no flagged cadence in 2188.5–2192.2. QLP flags one isolated cadence at 2190.241 (bit 128), which is 0.11 d before the step and unrelated to it.
* **Momentum dumps.** QLP marks dumps at 2189.525 and 2191.616, 0.83 d and 1.26 d from the step, so the step isn't at a dump. The nearest gap (the orbit gap, 2185.94–2186.95) is 3.4 d away.
* **Background.** Unchanged across the step (537.7 → 537.2 e⁻/s). The sector median is 543 e⁻/s, so there's no scattered-light episode.
* **Pointing and jitter.**
  * POS_CORR1/2 change by 0.09 / 4.0 mpx, so the spacecraft didn't move.
  * MOM_CENTR1 shifts by +12 mpx: the light-weighted centroid moves toward the brightened pixel.
  * Jitter in/out ratios are 0.66–1.26.
* **Other stars.**
  * 20 TESS-SPOC S32 SAP light curves on camera 4 CCD 2 within 16′ (T 9.2–13.4) show steps of |0.06–1.11| ppt (median 0.29) at 2190.358.
  * With the step modelled, none has a dip > 3σ. Without it, one star 13′ away (TIC 382102469) gives 1.41 ± 0.30 ppt, and it also gives 0.86 ppt with the step modelled.
  * 5 more stars in the 41×41 cutout (T 12.4–13.2) show no step (|step| ≤ 1.5 ppt) and no dip.
  * None shows a +10 ppt step: the effect is local.

## 4. Location (`data/step4_pixels.json`, `data/step3_neighbors.json`, `figs/step4_pixels.png`, `figs/step4_hotpixel.png`)

* **Step map** (line + step + dip per pixel, ±1 d, 21×21 cutout):
  * Pixel (12,10) changes by **+16.8 e⁻/s, z = 83**. Its median flux is 181 e⁻/s; it sits on the wing of the target, 1.18 px away.
  * All other pixels within 4 px change by −0.7 to +1.2 e⁻/s.
  * The 41×41 cutout gives the same pixel, +17.0 e⁻/s, z = 104. No other pixel among 1681 has |z| > 8.
* **Per-cadence.** The pixel reads 169.4–171.6 e⁻/s up to 2190.3515 and 186.5–187.9 e⁻/s from 2190.3584 on. Its four neighbours stay at 119–120 e⁻/s.
  * The pixel/neighbour ratio is 1.45 (orbit 1), 1.42 (orbit 2 before the step), then 1.57–1.59 for the rest of the sector.
* **Dip map without a step term.** Its centroid is 24.9″ from the target, on the same pixel. That is the vet's "source 18″ from the target where no catalogued star fits".
* **Gaia neighbours.** No Gaia DR3 source lies on that pixel: nothing between 14″ (G 20.0) and 44″ (G 18.3).
  * The vet's 3% and 9% "eclipse" candidates are excluded in their own pixels:
    * TIC 382069792 (T 14.0, 70″): 0.35–0.64 ± 0.8 ppt with the step modelled. A 3% eclipse would put about 30 ppt there.
    * TIC 382069803 (T 15.4, 75″): 1.0 ± 2.1 / −1.8 ± 2.0 ppt. A 9% eclipse would put about 90 ppt there.
  * Neither has a QLP or TESS-SPOC light curve; only year-1 HLSPs exist.
  * With the step modelled the target aperture has no dip at all, so no neighbour has anything to explain.

## 5. All sectors (`data/step5_search.json`)

* **Box search.** A 5.4 h box on a ±1 d quadratic, run on raw SAP of 42 sectors (TESS-SPOC where available, else QLP). It finds 41 dips and 29 brightenings at ≥ 4σ. The deepest are QLP S90 (up to 28 ppt), S87 and S61, together with matching brightenings and level shifts of 5–43 ppt. Raw-SAP extremes on this star are systematics-dominated in both directions.
* **The S32 event** (box 5.04 ppt, robust SNR 11.9) ranks 9th among the dips. Its 0.2 d neighbour at 2190.448 is the 10.9σ "brightening" on the other side of the same step.
* **Step scan.** In contiguous data, the S32 step is the most significant level shift in all sectors (z = 60). The S35 shift at 2266.635 (4.5 ppt) is different: a multi-pixel dipole (−28 / +25 e⁻/s) 5 px from the target (`data/step4_s35.json`), not a single pixel. Its cause wasn't investigated.
* **Repeats, odd/even, secondary and allowed periods** are moot, because no transit exists to fold. The vet's "secondary" at 3932.69 doesn't appear in this raw-SAP search, which agrees with the vet's own finding that it isn't in raw flux.

## 6. Shape (`data/step6_fit.json`)

Batman fits to TESS-SPOC S32 SAP within ±1 d, circular, with P fixed at 636 d (the vet's most probable period). The host is ρ★ 2.3–2.7 ρ☉ (FLAME / TIC).

| Baseline | Fit |
|---|---|
| Line, no step | k 0.064, b 0.26, **T14 21.3 h**, **ρ 0.43 ρ☉** (6× too low). The transit model has to absorb the step. Δχ² 496 |
| Line + step | k 0.025, depth 0.77 ppt, ρ 25 ρ☉ (unphysical), **Δχ² 4.6, ΔBIC −18**: no transit |
| Box with step, 5.4 h at the vet's tc | −0.12 ± 0.37 ppt (β included). 3σ upper limit **0.98 ppt → R_p < 2.4 R⊕** |

## 7. Catalogs (`data/step7_catalogs.json`)

* **ExoFOP.** No TOI, CTOI, imaging, spectroscopy or companions. Not in the TOI list (8152 lines) or the CTOI list (5140 lines).
* **AAVSO VSX API, 3′.** Nothing for the target. The only entry is Gaia DR3 4762691815811297536, an EA-type EB with P 20.1 d, G 16.35–16.56 and a 9 h eclipse, about 175″ away. It is far outside the photometric aperture, and its pixels weren't tested.
* **SIMBAD.** 2MASS J05185789−5902575, type PM*, RV 85.15 km/s (GALAH DR3). No variability type.
* **VizieR.** The CfA mirror returned 502 for VSX, the TESS EB catalog, WDS, TBOSB1 and Gaia NSS. The CDS mirror wasn't retried.

## What would change the verdict

Only a dip at a different time, in pixels without a step. In S32 the target's own pixels carry no dip (≤ 0.98 ppt at 3σ) once the step is modelled. No other sector shows a comparable on-target event in raw flux that isn't a systematic. Nothing remains to follow up for this event.

## Not checked

* **The physical cause of the pixel step.** Candidates include a radiation-induced change in pixel response or an electronic offset, but no TESS data-release note or engineering log was consulted. The single-pixel spatial confinement, shown above, is what rules out an astrophysical source.
* **Whether the same physical CCD pixel steps in other sectors.** TESScut indices are relative to each cutout, so the S33 "same index" pixel in `figs/step4_hotpixel.png` is a different physical pixel and says nothing.
* **The SPOC TESS-SPOC aperture mask for S32.** The TP file wasn't downloaded. That the pixel is inside it is inferred from the SAP step (+10 ppt = 17.5 e⁻/s of 1741 e⁻/s, which matches the pixel's 16.8 e⁻/s).
* **VizieR catalogs** (VSX-VizieR, TESS EB catalog, WDS).
* **The cause of the QLP S87/S90/S61 systematics** and of the S35 dipole.

## Pipeline note

1. **Test for a step before calling a dip.** At every candidate, compare a line + step (step time free near either box edge) with a line + box on raw SAP. Here the step model wins by ΔBIC 513 and leaves −0.12 ppt. A box that ends exactly at a one-cadence discontinuity is a red flag.
2. **Run a per-pixel step scan with the difference image.** A change confined to one pixel (> 90% of the flux change, z = 83) is instrumental by construction. The vet's difference-image check found the off-target location but read it as "an uncatalogued source, or a PSF mismatch".
3. **Don't let detrending turn steps into transits.** Running-median and spline filters turn a step into a one-sided dip plus a matching brightening; here the brightening at 2190.448 is 10.9σ. A dip immediately followed by an equal brightening should be checked for a step.
4. **Calibrate the Gaia RV "K limit" against stars of the same grvs_mag.** A rv_amplitude_robust of 25 km/s at grvs 11.9 is the 91st percentile of ordinary stars, not a constraint worth quoting.

## Files

Run every script with `../.venv/bin/python -W ignore <script>` from this folder.

**Scripts:**
* Shared modules: `common.py`, `lcio.py`, `measure.py`
* Step 1: `step1_tic.py`, `step1_products.py`, `step1_download.py`, `step1_tesscut.py`, `step1_gaia.py`, `step1_gaia_rv.py`
* Step 2: `step2_look.py`, `step2_zoom.py`, `step2_step.py`, `step2_archival.py`
* Step 3: `step3_flags.py`, `step3_neighbors.py` (41×41 cutout stars, pixel step scan, named neighbours), `step3_neighbors_spoc.py` (20 same-CCD TESS-SPOC stars; output in `data/step3_neighbors_spoc_sameccd.txt`)
* Step 4: `step4_pixels.py`, `step4_hotpixel.py`, `step4_s35.py`
* Steps 5–7: `step5_search.py`, `step6_fit.py`, `step7_catalogs.py`

**Figures (`figs/`):** `step2_window_s32.png`, `step2_s32_full.png`, `step2_zoom_s32.png`, `step4_pixels.png`, `step4_hotpixel.png`

**Data (`data/`):**
* Star and neighbours: `tic.json`, `tic_120arcsec.csv`, `gaia_2arcmin.csv`, `step1_gaia.json`, `step1_gaia_rv.json`
* Depths and steps: `step2_step.json`, `step2_archival.json`, `step2_zoom.txt`
* Systematics: `step3_flags.json`, `step3_neighbors.json`
* Pixels: `step4_pixels.json`, `step4_hotpixel.json`, `step4_s35.json`
* Search, fit and catalogs: `step5_search.json`, `step6_fit.json`, `step7_catalogs.json`
* Downloads: light curves in `lc/` and `lc_neighbor/`, TESScut cutouts in `tesscut/` and `tesscut_big/`
