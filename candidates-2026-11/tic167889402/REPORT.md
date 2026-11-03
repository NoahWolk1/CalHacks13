# TIC 167889402 (HD 53500 = HIP 33733): follow-up of the single dip at BTJD 3915.895

Analysis run 2026-11-02. It uses public data only: MAST (42 SPOC 2-min sectors, S1–S97; QLP S87–S98; the S96 SPOC 2-min target pixel file; S96 2-min light curves of 12 other stars), the TIC 8.2, Gaia DR3, SIMBAD (CfA TAP mirror), and the ExoFOP target JSON plus the TOI and CTOI lists (read only). Nothing was submitted anywhere.

## Verdict: **noise/systematic artifact.** The "transit" is a trough of the star's own pulsation that the sweep's detrending left behind

* **The star pulsates.** It is a multi-periodic, γ Dor-like variable. The strongest modes are at 0.184, 0.367, 0.176 and 0.193 c/d with 1–2.5 ppt each, which beat to ±4–5 ppt. BTJD 3915.895 sits exactly at a pulsation minimum. In raw SAP, the flux there is **3.6 ppt below the mean of the values 0.6 d either side**, a trough sharper than 99.6% of epochs (`figs/step2_s96_window.png`).
* **A 1-d running median leaves a residual at sharp troughs.** Across all 42 sectors, the residual box depth from a 1-d running median correlates with trough sharpness at **r = 0.83**. That detrender leaves **0.66 ppt at 3915.895**, deeper than 99.5% of positions. The vet's "secondary eclipse" at **3701.52 is the sharpest trough in the data** (−5.3 ppt). It leaves 0.97 ppt, which is why it came out at "144% of the depth".
* **With the pulsations modelled, there is no dip in any product.**
  * Fitted as a(1 + k·P(t)) + baseline + 8 h box, the depths are **SAP −0.04 ± 0.09, PDCSAP −0.03 ± 0.12 and QLP −0.04 ± 0.10 ppt**.
  * Our own TPF photometry gives **−0.04 to −0.05 ± 0.09–0.12 ppt in every aperture from 9 to 68 px**.
  * With the multi-sector pulsation model's amplitude fixed (k = 1), the depths are 0.19 ± 0.13 (SAP), 0.27 ± 0.17 (PDCSAP) and 0.29 ± 0.17 (QLP). All are well below 0.647 ppt.
* **Events this size are routine, in both directions.** In the all-sector prewhitened SAP, the 8 h-box scatter is σ = 0.205 ppt. Over ~2900 independent boxes there are **12 dips and 11 brightenings at ≥ 0.647 ppt**; PDCSAP has 23 and 34. On the same footing, the S96 event itself measures **0.04 ppt**.
* **The vet's "repeats" are not there.** All 6 of them, plus 3701.52, 3706.68 and 3746.57, measure **−0.26 to +0.17 ppt** in prewhitened SAP (|signal| ≤ 1.3σ).

**Confidence.** High (>95%) that no 0.65 ppt, 8 h transit occurred at 3915.895. A 0.647 ppt box is excluded at 7σ when the pulsation amplitude is free and at about 3.4σ when it is fixed. Even taking the most favourable product (PDCSAP, fixed amplitude, linear baseline: 0.63–0.69 ppt), 1.7% of all S93–97 epochs are as deep and 2.8% are as bright. That is roughly 8–13 equivalent events per 158 d.

**The binary flags are real, but not the cause.** HD 53500 is the catalogued visual double **RST 226 AB** (WDS J07005−6555AB). B is at **0.64″** (PA ≈ 217°), with V 8.48 against 10.09 (ΔV 1.6, B ≈ 19% of the light). B is not the 2.6″ Gaia source.
* This explains RUWE 2.38, the 89% multi-peak windows, `duplicated_source` = True, and the missing Gaia RV and GSP-Phot parameters.
* ExoFOP lists "0 companions" because it does not carry the WDS pair.
* It only matters for dilution if something real is ever found.

## Status of each step

| # | Step | Status |
|---|---|---|
| 1 | Host: TIC 8.2, Gaia DR3 (astrometry, IPD, NSS, vari, AP tables), SIMBAD | **verified**. Visual double RST 226 AB (0.64″). Gaia binarity flags explained. Not in any Gaia NSS or variability table |
| 2 | Depth in SPOC SAP/PDCSAP (2-min), QLP, own TPF photometry (4 apertures × 2 backgrounds), PDC correction | **verified**. A dip appears only with a polynomial baseline that cannot follow the pulsation. Depth runs 0.30 → 0.70 → 2.3 ppt as the window grows from ±0.75 to ±1.5 d, with β = 3–10. With pulsations modelled it is 0 in every product |
| 2 | HLSPs (TASOC, TGLC, T16, ELEANOR-lite exist, mostly for S1–S13) | **not used**. None covers S96 except QLP, which was measured |
| 3 | Quality flags, momentum dumps, gaps, background, jitter, centroids, 12 same-CCD stars | **verified**: nothing at the epoch |
| 4 | Per-pixel deficit (pulsation-regressed), aperture growth, Gaia neighbours | **verified**. No deficit, no aperture dependence. The required eclipse depths are moot because there is no dip |
| 5 | All 42 sectors: prewhitening per sector group, 8 h-box statistics, the vet's repeat epochs, allowed periods | **verified** (see §5) |
| 6 | batman fit and implied density | **run** (face value). It latches onto a 30–38 h residual wiggle with ρ★ ≤ 0.007 ρ☉ against ~0.44: unphysical |
| 7 | ExoFOP, TOI, CTOI, SIMBAD | **verified**: nothing known; no imaging or spectroscopy on ExoFOP |
| 7 | VSX, HGCA / Kervella PMa, WDS row, SB9 (VizieR) | **failed**. The CfA VizieR returned 502 and CDS timed out. The WDS pair comes from SIMBAD identifiers. Gaia vari_summary has no entry |

---

## 1. Host star

| Quantity | Value |
|---|---|
| Names | HD 53500, HIP 33733, CD−65 482, TYC 8920-1204-1, RST 226 AB, WDS J07005−6555AB, CCDM J07005−6555AB, 1RXS J070028.6−655424 |
| SIMBAD | type `**`, G0V. A: V 8.48. B: V 10.09, at 0.64″, PA ≈ 217° |
| TIC 8.2 | Tmag 7.84, V 8.28, Teff 6308 K, R★ 1.42 R☉, d 71.5 pc, dwarf. No mass, logg or ρ. Contamination ratio 0.0066 |
| Gaia DR3 5282036164572097024 | G 8.33, BP−RP 0.77, ϖ 13.92 ± 0.06 mas |
| Gaia binarity indicators | **RUWE 2.38**, astrometric excess noise 0.46 mas (94σ), **ipd_frac_multi_peak 89%**, harmonic amplitude 0.094, duplicated_source = True. No RV and no GSP-Phot or FLAME parameters. non_single_star = 0, and there are no NSS, vari_summary or EB entries |
| Implied density | M ≈ 1.25 M☉ for an early-G/late-F star of 1.42 R☉ gives ρ★ ≈ 0.44 ρ☉ |

**Reading the flags.** A multi-peak fraction of 89% means a second peak appears in almost every Gaia window. Bright-star windows are about 0.7″ × 2.1″, so the companion must be inside about 1″. The 2.65″ source would fall mostly outside the windows, and RST 226 B at 0.64″ (ΔV 1.6) is the natural cause. An unresolved pair of that brightness ratio easily produces RUWE ≈ 2.4 and the lost RVS spectrum.

## 2. Depths at 3915.895 (S96, camera 4, CCD 3)

| Product / method | Depth [ppt] |
|---|---|
| SPOC SAP, quadratic baseline ±0.75 / ±1.0 / ±1.5 d | 0.30 ± 0.17 / 0.70 ± 0.29 / 2.28 ± 0.90 (β 3.0 / 5.8 / 9.1) |
| SPOC PDCSAP, same windows | 0.33 ± 0.17 / 0.71 ± 0.34 / 2.35 ± 0.94 |
| QLP SAP, same windows | 0.31 ± 0.16 / 0.72 ± 0.31 / 2.34 ± 0.92 |
| S93–97 40-frequency prewhitening, then a linear baseline: SAP | 0.14–0.26 ± 0.20 (frac_deeper 0.09–0.19) |
| Same: PDCSAP | 0.46–0.70 ± 0.27 (frac_deeper 0.006–0.017) |
| a(1 + kP) + per-segment quadratic, ±1.5 d, **k free**: SAP / PDCSAP / QLP | **−0.04 ± 0.09 / −0.03 ± 0.12 / −0.04 ± 0.10** (k = 1.11 / 1.14 / 1.16) |
| Same with k = 1: SAP / PDCSAP / QLP | 0.19 ± 0.13 / 0.27 ± 0.17 / 0.29 ± 0.17 |
| Own TPF photometry, k free: 3×3 core / SPOC 26 px / +1 px (45) / +2 px (68) | −0.05 / −0.04 / −0.04 / −0.04, all ± 0.09–0.12; the same with background added back |
| All-sector prewhitened SAP / PDCSAP, local quadratic ±1 d | 0.04 / 0.04 ppt (σ_emp 0.205 / 0.202) |

The "depth" is set entirely by how the baseline handles the pulsation trough (`figs/step2_prewhitened_window.png`). After prewhitening, SAP shows only a ±0.3 ppt, ~1 d wiggle with no ingress or egress. PDCSAP shows a broader −0.8 ppt depression, about 1.4 d long. The PDC correction itself is a smooth ramp of about 0.5 ppt/d with no box (in-box minus sides: −0.008 ppt; `figs/step2_pdc_correction.png`). The extra PDCSAP depression therefore comes from how that ramp interacts with the pulsation fit, not from the star. k > 1 means the 158-d coherent model slightly under-predicts the S96 amplitude (unresolved, closely spaced g-modes). That is exactly the residual a fixed model leaves at a trough.

**Why the vet's pixel checks "couldn't run".** The vet's per-event table does not contain the input epoch at all. It tests the two "recovered" dips, **3069.25 (0.52 d after the start of S65) and 3746.57 (0.37 d before the end of S89)**. Both sit at sector edges, so no cutout has clean frames on both sides. The S96 event has a full TPF with 240 unflagged in-box cadences.

## 3. Systematics (S96)

* **Quality.** No flagged cadences in the box. The momentum dumps are at 3907.77, **3914.40** (1.4 d before), 3920.69 and 3927.36. The data gap at 3914.19–3914.40 ends 1.3 d before the event.
* **Jitter and centroids.** The 1 h centroid jitter in the box is 2.03 mpx against 2.27 mpx outside (ratio 0.89). The in-box centroid offsets are 0.06 mpx (column) and 0.05 mpx (row), against a per-cadence rms of 1.5–1.7 mpx.
* **Background.** SAP_BKG in the box is 2437 e⁻/s against 2441 on the sides, which is −0.03 ppt of the star's flux.
* **Other stars.** Twelve bright stars (T 6.7–7.7) on the same CCD have median 8 h depths at 3915.895 of **+0.009 ppt (SAP)** and **−0.004 ppt (PDCSAP)**. All are within ±0.08 ppt. Nothing common-mode is present, and none is needed.

## 4. Pixels and neighbours

* **Per-pixel deficit** (`figs/step4_tpf_s96.png`). Each pixel was fit with the pulsation model plus the box. The deficit summed over the aperture is −3.5 e⁻/s (−0.03 ppt). There is no PSF-shaped deficit, and all pixels are within ±2–3σ. The only structure is a small ± dipole on the two peak pixels, typical of sub-mpx pointing drift.
* **Aperture growth.** The depth is flat at about −0.04 ppt from 9 to 68 px.
* **Gaia DR3 within 2′.** There are 46 sources. These are the eclipse depths a neighbour would need to make 0.647 ppt:

  | Source | Sep | G (ΔG) | ϖ [mas] | Needed eclipse |
  |---|---|---|---|---|
  | 5282036168867187200 | 2.65″ | 14.20 (5.87) | 1.70 | 14.5% |
  | 5282047954259650048 | 110″ | 15.10 (6.77) | 0.37 | 33% |
  | 5282035928351261568 | 77″ | 15.58 (7.25) | 0.45 | 52% |
  | 5282035893991523456 | 88″ | 15.91 (7.58) | 0.51 | 70% |
  | 5282035962711000576 | 25″ | 16.18 (7.85) | 0.43 | 89% |

  The 2.65″ source is a background star at about 590 pc, with proper motion unrelated to HD 53500 (−6, −11 mas/yr against −25, +130). It has no BP/RP and RUWE 2.30, which is probably contamination from the bright primary. A background EB there could in principle make a dip, but there is no dip to explain.
* **RST 226 B** (0.64″, ΔV 1.6) is the closest light source. If a signal is ever found, its depth on A would be diluted by about 19%.

## 5. All sectors

* **Coverage.** SPOC 2-min data exist for S1–5, 7–13, 27–35, 37–39, 61–69, 87–90 and 93–97: 42 sectors spanning BTJD 1325–3988. The sweep's vet used only 16 of them.
* **Prewhitening.** Each contiguous group was prewhitened with 40 frequencies on 30-min bins. The dominant 0.18 c/d mode is present in every group. Residual rms per 30-min bin is 0.18–0.56 ppt.
* **Noise statistics.** The 8 h box was slid in 0.05 d steps over 18,404 positions (~2,900 independent boxes).

  | | SAP | PDCSAP |
  |---|---|---|
  | σ_emp (8 h box) | 0.205 ppt | 0.202 ppt |
  | Independent dips ≥ 0.647 ppt | 12 | 23 |
  | Independent brightenings ≥ 0.647 ppt | 11 | 34 |
  | Largest dip / brightening | 0.84 / −1.06 ppt | 1.59 / −2.74 ppt |
  | Event at 3915.895 | 0.04 ppt | 0.04 ppt |

  Dips and brightenings occur at the same rate, the signature of noise and systematics. The per-sector 3σ limits for an 8 h box are 0.33–0.89 ppt.
* **The vet's "repeat" epochs, in prewhitened SAP.**

  | Epoch | 3069.25 | 3073.75 | 3079.58 | 3094.66 | 3122.26 | 3140.90 | 3701.52 | 3706.68 | 3746.57 |
  |---|---|---|---|---|---|---|---|---|---|
  | Depth [ppt] | −0.06 | +0.17 | +0.16 | +0.07 | −0.18 | −0.26 | −0.08 | +0.17 | −0.19 |

  None is a dip. With the 1-d running median, 3073.75, 3079.58 and 3140.90 rank in the deepest 3–6% of positions, and 3701.52 in the deepest 0.04%. These are the trough residuals that the vet's detrending turned into "repeats" (`data/step5_troughs.json`).
* **Allowed periods, if the dip were real** (an epoch excludes P when it measures < 0.24 ppt). All P < 161 d are excluded, including the vet's 68.44 and 74.66 d. The vet's 169.33 d is also excluded. 0.5% of 100–300 d, 24% of 300–1000 d and 71% of 1000–3000 d survive (`data/step5_periods.json`). The list is moot.

## 6. Face-value transit fit (`data/step6_fit.json`, `figs/step6_fit.png`)

batman was fit to the prewhitened residuals at ±1.5 d with a linear baseline, for P = 40–1000 d.
* In PDCSAP, the fit locks onto the broad residual depression: T14 = 29–38 h, b = 0.92–1.05 (grazing), minimum about 0.8 ppt, and ρ★ = 0.001–0.003 ρ☉.
* In SAP, it gives T14 ≈ 29–33 h, minimum about 0.3 ppt, and ρ★ ≤ 0.007 ρ☉.

The fitted density is more than 60 times below the star's ~0.44 ρ☉. An 8 h, 0.65 ppt transit, the vet's claim, is not what the data contain. The large ΔBIC against a straight line only reflects ~1 d red-noise wiggles, which occur everywhere (§5).

## 7. Prior knowledge

* **ExoFOP.** No TOIs, CTOIs, imaging, spectroscopy or stellar companions. The JSON was saved after one retry.
* **TOI and CTOI lists** (8152 and 5140 lines): no rows for TIC 167889402.
* **SIMBAD (CfA TAP).** HD 53500 is a `**` (G0V) with components HD 53500A and HD 53500B (RST 226), and an X-ray counterpart in 1RXS. Nothing marks it as a variable or a planet host.
* **VizieR** (VSX, HGCA / Kervella PMa, WDS row, SB9, TESS EBs) was unreachable: the CfA mirror returned 502 and CDS timed out. Gaia DR3 vari_summary and vari_eclipsing_binary have no entry.

## What would change the verdict

Nothing in the existing data: the event is reproduced by the detrending and removed by modelling the star. A real ~0.6 ppt transit would have to show three things:
1. A box-shaped deficit that survives free-amplitude pulsation modelling. Here it is −0.04 ± 0.09 ppt.
2. A rate of such dips clearly above the rate of brightenings. Here the two rates are equal.
3. A repeat. None is found in 42 sectors.

No follow-up is recommended.

## Not checked

* VSX, HGCA / Kervella proper-motion anomaly, the WDS measurement history and SB9 (VizieR down).
* Which component pulsates (A or B).
* TESScut FFI photometry. The 2-min TPF covers the event and is strictly better.
* T16, TASOC, TGLC and ELEANOR-lite. None covers S96.

## Pipeline note

1. **Model the star before the single-event search when it is a coherent multi-periodic pulsator.** Use prewhitening over a multi-sector baseline, or regress a pulsation model with a free amplitude. A 1-d running median leaves residual dips at sharp troughs (r = 0.83 with trough curvature). Here that produced both the "transit" and the "secondary eclipse".
2. **Run the uniqueness test with the same detrending as the search and count brightenings.** Equal rates of dips and brightenings at the event's size mean the event is noise.
3. **Keep the input epoch in the vet's per-event table.** The vet replaced 3915.895 with two "recovered" dips at sector edges, so every pixel-level check was skipped.
4. **Cross-check SIMBAD/WDS for visual doubles** when Gaia shows a high multi-peak fraction or `duplicated_source`. ExoFOP's companion list missed RST 226 B.

## Files

Scripts: `step1_products.py`, `step1_download.py`, `step1_tic.py`, `step1_gaia.py`, `step1_tpf.py`, `step2_archival.py`, `step2_plot.py`, `step2_prewhiten.py`, `step2_plot_resid.py`, `step2_kfree.py`, `step2_pdc.py`, `step2_allproducts.py`, `step3_flags.py`, `step3_neighbors.py`, `step4_tpf.py`, `step4_gaia.py`, `step5_allsectors.py`, `step5_troughs.py`, `step5_periods.py`, `step6_fit.py`, `step7_catalogs.py`, `step7_catalogs2.py`, plus `lcio.py`, `measure.py` and `common.py`. Run them with `../.venv/bin/python -W ignore` from this folder. `step2_prewhiten.py` must run before `step2_kfree.py`, `step2_allproducts.py`, `step4_tpf.py` and `step6_fit.py`. `step5_allsectors.py` must run before `step5_periods.py`.
