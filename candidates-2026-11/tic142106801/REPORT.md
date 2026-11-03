# TIC 142106801: follow-up of the single-transit find at BTJD 1492.739 (S7), with the vet's claimed repeat at 3680.19 (S87)

Analysis run 2026-11-02. It uses public data only: MAST light curves (QLP for 42 sectors S1–S98; GSFC-ELEANOR-LITE, TGLC and TASOC for S5–S8), TESScut 21×21 cutouts for S7 and S87, the TIC 8.2, Gaia DR3 (ESA archive, including the astrophysical-parameter, variability and NSS tables), SIMBAD (CfA mirror), the AAVSO VSX API, and ExoFOP pages and TOI/CTOI lists, read only. Nothing was submitted anywhere. No SPOC or TESS-SPOC product exists for this star.

## Verdict: **noise/systematic artifact.** The S7 "transit" is one detector pixel stepping up by 17 e⁻/s at 1492.824. The S87 "repeat" is a residual of the scattered-light ramp at the start of an orbit

**The S7 event (1492.739) is a single-pixel step, not a dip.**
* In our own TESScut photometry, one pixel 1.25 px from the target (row 12, col 10) **jumps from 102.7 to 120.0 e⁻/s at 1492.824**, a 282σ step. It then decays slowly through orbit 1 and jumps again at the start of orbit 2. The six pixels around it, including the target's peak pixel, are flat to within 1 e⁻/s.
* **During the "transit" that pixel is at its pre-step level** (102.3 e⁻/s against 102.7 before). Nothing gets fainter. The dip is what a ±1 d baseline or a QLP spline makes of a step at the end of the box: the 6 h before the step are low only relative to what comes after.
* **A step model beats the box at the same time in every aperture product**: by **ΔBIC = 118** (QLP SAP, step +16.3 ppt), 172 (TGLC aperture flux, +22.2 ppt) and 145 (own r = 1.5 px photometry). With the step in the model, the box depth is **−0.57 ppt (QLP SAP)**, **+0.08 ppt (TGLC aperture)** and 1.9 ppt (own photometry, ΔBIC −0.9, so no preference).
* **Products that don't use that pixel, or down-weight it, see nothing.** ELEANOR-lite gives 0.27 ± 0.47 ppt (CORR), 0.50 ± 0.56 (RAW) and 0.51 ± 0.50 (PCA). TGLC's PSF flux gives 1.16 ± 0.88 ppt. Our own photometry with the pixel masked gives **1.39 ± 0.95 ppt (r = 1.5 px)** to 3.18 ± 2.42 (r = 3 px), and the step falls from 20.7 to 1.8 ppt. The vet's "pipelines disagree" flag (QLP 4.06 against ELEANOR 0.38 ppt) was correct.

**The S87 "repeat" (3680.19) is scattered light.**
* It sits 0.8 d after the end of a QLP bit-30 (scattered-light) flagged stretch at the start of the orbit. QLP's background falls from **20,700 to 0 e⁻/s** over the 1.5 d around it and is 8,050 e⁻/s during the event. SAP flux falls by about 250 ppt over the same stretch (r(flux, background) = **0.986**), and the centroid drifts 0.15 px through the event.
* Only QLP's detrended flux shows the dip: 11.7 ± 3.6 ppt in `DET_FLUX` and 16.1 ± 5.0 in `DET_FLUX_LAG`, but 3.9 ± 11.7 in SAP and `SYS_RM_FLUX`. Our background-subtracted TESScut photometry gives **2.0 ± 3.0 ppt (r = 1.5 px)**, and 18% of slid boxes are deeper. With the background as a regressor, the model without a box is preferred (ΔBIC = 2).
* The same stretches of S87 hold the three strongest "dips" in all 42 QLP sectors (3666.32, 3665.87, 3680.22) and two of the strongest brightenings (−17 ppt at 3666.07, −12.7 at 3679.97).
* Its face-value depth (20 ppt in a batman fit) is also 4× the S7 one (5.1 ppt). The 2187 d "period" is meaningless.

**Confidence.** High (>95%). Both events are explained by systematics seen directly in the pixels and the background. Once those are modelled, neither has a significant residual.

## Status of each step

| # | Step | Status |
|---|---|---|
| 1 | Host: TIC 8.2, Gaia DR3 (astrometry, RUWE, IPD, NSS, RV, GSP-Phot/FLAME, variability) for the target and all 35 G < 19.5 neighbours within 2′; SIMBAD; LMC check | **verified**: single Milky Way G subgiant/old dwarf, R = 1.53 R☉. Gaia lists no binarity or variability for any of the 36 sources |
| 2 | Depth in QLP (SAP, KSPSAP/DET and the SML/LAG apertures, SYS_RM), ELEANOR-lite (RAW/CORR/PCA), TGLC (PSF/aperture, raw/cal), own TESScut photometry (5 apertures × 2 backgrounds) at both epochs | **verified**. The dip appears only in aperture fluxes that include pixel r12c10 (S7), or in QLP's detrended flux (S87) |
| 2 | TASOC, T16 | **n/a**: TASOC covers only S5–6, and the T16 S6 file was corrupt. Neither covers an event |
| 3 | Quality flags, background, centroids, pixel-level step, step vs box, other stars in the cutout | **verified**: the S7 step is a single-pixel jump; S87 is a scattered-light ramp. No common-mode dip on 3 other cutout stars in either sector |
| 4 | Localisation | **verified** for S7: the "signal" is one pixel that is not on the target's PSF peak. For S87 it is moot (background). The depths each neighbour would need are in §1 |
| 5 | All 42 QLP sectors: box search, dips against brightenings, aliases, periodogram | **run**: brightenings outnumber dips at every threshold. No 9–12 h periodicity |
| 6 | Face-value batman fits, implied ρ★ | **run**: ρ★ = 45 and 18 ρ☉ against FLAME's 0.265 ρ☉, and the two "transits" have depths 4× apart |
| 7 | ExoFOP, TOI, CTOI, VSX API, SIMBAD | **verified**: nothing on ExoFOP; not in the TOI (8152 lines) or CTOI (5140) lists; VSX empty within 72″; SIMBAD has no type. VizieR was unreachable (CfA 502, CDS timeout) |

---

## 1. The host (`data/tic.json`, `data/step1_gaia*.txt`, `data/gaia_2arcmin.csv`)

| Quantity | Value |
|---|---|
| Names | UCAC4 081-008395, 2MASS J06363834-7357185, GALAH 170122003101297, Gaia DR3 5262252415631141888 |
| TIC 8.2 | Tmag 12.94, Teff 5736 K, logg 4.11, R 1.48 R☉, M 1.02 M☉, d 726 pc, contamination 0.019 |
| Gaia DR3 | G 13.43, BP−RP 0.95, ϖ 1.361 ± 0.011 mas, μ (8.26, −0.08) mas/yr, **RUWE 0.97**, ipd_frac_multi_peak 0, harmonic amplitude 0.009, non_single_star 0 |
| Gaia RV | 26.7 ± 1.9 km/s (25 transits). GALAH DR3 (via SIMBAD) gives 25.48 ± 0.11 km/s, consistent |
| GSP-Phot / FLAME | Teff 5444 K, logg 4.19, [M/H] −0.17, R 1.53 R☉; FLAME M 0.95 M☉, L 1.85 L☉, age ≈ 13 Gyr (evolstage 442: an old star just leaving the main sequence). ρ★ = 0.265 ρ☉ |
| M_G | 3.98 (A_G 0.12). That sits on the old-turnoff/subgiant branch, consistent with FLAME |
| Gaia tables | no vari_summary, vari_classifier, NSS two-body, acceleration or eclipsing-binary entry. DSC P(binary) = 5×10⁻⁵ |
| LMC? | **No.** The star is 8.7° from the LMC centre; ϖ = 1.36 mas (735 pc), RV 26 km/s and μ (8.3, −0.1) mas/yr are all Milky Way values. The LMC values are ϖ 0.02 mas, RV ≈ 270 km/s and μ ≈ (1.9, 0.3) mas/yr |

**Neighbours.** Gaia DR3 has 35 sources with G < 19.5 within 2′. None has an NSS or variability entry; one (G 16.82 at 58.6″) has RUWE 3.7. Eclipse depth each would need to make 4.4 ppt, if it were entirely inside the aperture (a lower bound):

| Neighbour | Sep | G | Needed depth |
|---|---|---|---|
| 5262252411334465536 | 19.0″ | 17.98 | 29% |
| 5262252617492899968 | 31.2″ | 17.68 | 22% |
| 5262252308258008576 | 37.8″ | 17.52 | 19% |
| 5262252346911665536 | 51.5″ | 16.81 | 10% |
| 5262252621789572736 | 52.1″ | 15.48 | 2.9% |
| 5262252686212379520 (RUWE 3.7) | 58.6″ | 16.82 | 10% |

This is moot, because neither event behaves like a star dimming (§2–§4).

## 2. Depths (`data/step2_archival.json`, `data/step2_own_phot.json`, `data/step4_pixel.json`, `data/step3_step_vs_box.json`)

**Method.** I fit a 6 h trapezoid plus a quadratic baseline for each data segment within ±1 d (`measure.py`), using quality = 0 cadences only. The error is max(σ_white·β, σ_emp). frac_deeper is the fraction of boxes slid across the rest of the sector that come out at least as deep.

| Event | Product | Depth [ppt] |
|---|---|---|
| **S7 1492.739** | QLP SAP / KSPSAP / KSPSAP_SML / KSPSAP_LAG | 6.94 ± 1.17 / 5.78 ± 0.84 / 3.91 ± 0.87 / 7.66 ± 0.96 |
| | QLP SAP with a step at 1492.824 in the model | **−0.57** (step +16.3 ppt; ΔBIC box − step = +118) |
| | TGLC aperture / cal_aper | 9.98 ± 3.65 / 1.82 ± 0.78 |
| | TGLC aperture with the step in the model | **+0.08** (step +22.2 ppt; ΔBIC +172) |
| | TGLC PSF / cal_PSF | **1.16 ± 0.88 / 0.89 ± 0.81** |
| | ELEANOR-lite RAW / CORR / PCA | **0.50 ± 0.56 / 0.27 ± 0.47 / 0.51 ± 0.50** |
| | Own TESScut, background-subtracted, r = 1 / 1.5 / 2 / 2.5 / 3 px | 1.45 ± 0.88 / 9.32 ± 2.96 / 8.28 ± 2.22 / 8.06 ± 2.01 / 8.12 ± 2.12 (the r ≥ 1.5 apertures contain r12c10) |
| | Same, **pixel r12c10 masked**, r = 1.5 / 2 / 2.5 / 3 px | **1.39 ± 0.95 / 1.69 ± 1.59 / 2.41 ± 1.85 / 3.18 ± 2.42**; the step falls from 13–21 to 1.1–1.8 ppt |
| | Own TESScut without background subtraction | negative and meaningless (±20–37 ppt), because of the sector-start background ramp |
| **S87 3680.19** | QLP DET / DET_SML / DET_LAG | 11.72 ± 3.64 / 6.45 ± 2.06 / 16.07 ± 5.01 |
| | QLP SAP / SYS_RM_FLUX | 3.91 ± 11.67 / 3.92 ± 11.67 (β = 5.3) |
| | QLP SAP with background regressors | the no-box model is preferred by ΔBIC = 2.0 |
| | Own TESScut, background-subtracted, r = 1 / 1.5 / 2 / 3 px | **2.56 ± 2.09 / 2.02 ± 2.99 / 3.09 ± 4.73 / 6.36 ± 12.25** (frac_deeper 0.10–0.15) |

The QLP aperture's growing depth with size (SML 3.9 → nominal 5.8 → LAG 7.7 ppt in S7) is what the vet saw as a large/small ratio of 2.5. It is not dilution. It is the fraction of the aperture made up by the stepping pixel, which sits 1.25 px from the target and so falls outside QLP's smallest aperture's core.

## 3. Systematics (`data/step3_flags.json`, `data/step3_s87_bkg_and_cutout_stars.json`, `figs/step3_flags_s7.png`, `figs/step3_flags_s87.png`, `figs/step4_pixel_s7.png`)

**S7.**
* The event is 1.1 d after the sector start. The background ramp at the start of the sector (200 → 82 e⁻/s per pixel in ELEANOR/TGLC) has ended by 1491.95, before the box. Inside the box the background is flat.
* Flags: QLP flags 2 of 12 event cadences (bit 4096) and ELEANOR flags 3 (bit 128). There is no momentum dump in the window (bit 32 only at the first cadence, 1491.635).
* **Pixel r12c10** (`step4_pixel.py`). Background-subtracted, it reads 102.7 e⁻/s before, 102.3 in the event, then **120.0 immediately after 1492.824**. It decays to about 103 by 1503, then jumps again at the start of orbit 2 (about 1505) and decays again. Its step z-score is 282. The next largest steps in the cutout are on row 20, about 10 px away (z = 33–63), on a bright star at the cutout edge. That shows something happened on the detector at 1492.82, but I have not identified the cause. The target's own peak pixel (r11c10) does not change (253.9 → 252.4 → 252.6).
* **Other stars in the cutout.** Three Gaia stars with G 13.4–14.6 give 0.80 ± 1.16, 1.44 ± 2.16 and 0.25 ± 0.84 ppt in the same box. There is no common-mode dip.

**S87.**
* QLP flags every cadence before 3679.37 with bit 2³⁰ (scattered light). The event at 3680.06–3680.31 is in the first day of unflagged data.
* QLP SAP_BKG falls from 20,700 to 0 e⁻/s over ±1.5 d, and r(SAP flux, background) = 0.986. The SAP flux falls by about 250 ppt over the same time.
* The QLP centroid moves 0.15 px (X and Y together) during and right after the event. That is an aperture/background effect, not a star's centroid.
* Other cutout stars give −6.5 ± 4.0 and −0.7 ± 7.4 ppt.

## 4. Location

* **S7.** The whole "signal" is one pixel. It is 1.25 px from the target position, and neither the target's peak pixel nor any other neighbouring pixel shares it. A real eclipse of any star would spread over that star's PSF (several pixels). This is a detector or pixel-level effect, not an astrophysical source. It is not a neighbour: no Gaia source with G < 19.5 falls in that pixel. The nearest are 12″ (G 18.6) and 19″ (G 18.0), and the ≥22% eclipse those would need would also show in adjacent pixels.
* **S87.** Background-dominated. Our background-subtracted photometry shows no significant dip, so there is nothing to localise.
* Difference images: `figs/step2_own_phot.png` (S7 step image and S7/S87 event-deficit images).

## 5. All sectors (`data/step5_search.json`, `data/step5_extra.json`)

**Search.** A 6 h box was slid every 0.05 d through all 42 QLP sectors (KSPSAP or DET flux, 30-min bins, quality 0), and the local extrema were counted.

| Threshold | Dips | Brightenings |
|---|---|---|
| ≥ 3 ppt | 38 | 52 |
| ≥ 4.4 ppt | 14 | 22 |
| ≥ 6 ppt | 5 | 15 |
| ≥ 5σ | 28 | 44 |
| ≥ 8σ | 12 | 19 |

There are as many brightenings as dips, or more: features of this size are noise and systematics.
* The S7 event ranks 10th of 1694 dips by SNR.
* The top three dips are all in the S87 scattered-light stretches (3666.32, 3665.87, 3680.22), and S97 contributes the next three.

**Aliases.** If both events were real, P = 2187.45/n would be allowed only for n = 1 and 2: for n ≥ 3 another epoch falls in QLP data. This is moot because both events are artifacts.

**Variability.** The vet's "8 periodic signals at 11.4–12.8 h, about 1 ppt" are not reproduced.
* The Lomb–Scargle periodogram of all QLP detrended flux joined (0.5–4 c/d) peaks at 10.46 h, with power 0.0007, FAP 0.09 and semi-amplitude 0.075 ppt.
* Per-sector SAP periodograms show only 4–10 d power at 0.4–1.5 ppt, typical of FFI systematics. The exceptions are S63 (5 ppt) and S87 (the scattered-light ramp).
* The star is photometrically quiet, so no variability model is needed before measuring the dip.

**Odd/even and secondary eclipses.** These are not meaningful without a real periodic signal. The vet's "odd/even" pair (6.9 against 4.1 ppt) is S87 against S7.

## 6. Shape and stellar density (`data/step6_fit.json`)

Face-value batman fits of the events as the vet saw them, with P fixed at 2187.45 d, a circular orbit and quadratic limb darkening:

| Fit | Depth | b | a/R★ | T14 | Implied ρ★ |
|---|---|---|---|---|---|
| S7 QLP KSPSAP | 5.1 ppt | 0.73 | 2521 | 5.2 h | **45 ρ☉** (170× FLAME's 0.265) |
| S87 QLP DET | 20.1 ppt | 0.91 | 1854 | 6.2 h | **18 ρ☉** (67×) |

* A central transit of this star (R 1.53 R☉, M 0.95 M☉) would last **36.7 h at P = 2187 d** and 29.1 h at P = 1094 d. A 6 h duration on a circular orbit needs P ≈ 8 d, and a period that short is excluded by the many sectors without a repeat.
* The two "transits" disagree in depth by a factor of 4.
* At face value, 4.4 ppt on 1.53 R☉ would be an 11 R⊕ body.
* None of this is needed for the verdict.

## 7. Catalogs (`data/step7_catalogs.txt`, `data/exofop.json`)

* **ExoFOP.** No TOI, CTOI, confirmed planet, imaging or spectroscopy.
* **TOI and CTOI lists.** The star is in neither (8152 and 5140 lines).
* **AAVSO VSX API.** Nothing within 72″.
* **SIMBAD.** UCAC4 081-008395, type `*`, one reference (GALAH DR3, 2021MNRAS.506..150B: RV 25.48 km/s, [Fe/H] available).
* **VizieR.** Unreachable (CfA 502, CDS timeout), so the VSX-VizieR, TESS EB (Prša+2022) and Gaia classifier tables were not queried there. Gaia vari_* and vari_eclipsing_binary were queried directly at ESA and have no entry.

## What would change the verdict

* For S7: a dip of about 4 ppt in a reduction that excludes pixel r12c10 and fits the step. The best such numbers are 1.39 ± 0.95 ppt (own photometry) and 0.27 ± 0.47 (ELEANOR).
* For S87: a dip that survives background-subtracted pixel photometry. We measure 2.0 ± 3.0 ppt.
* Neither is realistic with existing data. A 2-min target pixel file of S7 would show the pixel directly at higher cadence, but S7 has no 2-min data for this star. No follow-up observation is recommended.

## Not checked

* The physical cause of the r12c10 step: a hot pixel, a cosmic-ray hit causing a persistent offset, or a detector event (the row-20 pixels also stepped). I checked only that it is confined to one pixel near the target.
* Bright same-CCD stars outside the 21×21 cutout. Only 3 stars inside the cutout were tested.
* VizieR catalogues (all mirrors down).
* An individual vet of the other strong QLP dips (S97 3951.26 at 7.3 ppt, S94 3874.82 and others).
* The vet's ASAS-SN data.

## Pipeline note

1. **Test a step against a box.** For every single event, fit "quadratic + step at a free time within ±0.5 d" alongside "quadratic + box". Here the step wins by ΔBIC 118–172 in every aperture product, and the box depth goes to zero. A spline-detrended flux (QLP KSPSAP/DET) turns any step into a dip.
2. **Treat "pipelines disagree" as decisive when a PSF or per-pixel product shows nothing.** ELEANOR (0.3 ppt) and TGLC PSF (1.2 ppt) against QLP (5.8 ppt) was the right lead. Next, add a per-pixel step scan of the TESScut aperture: one pixel with z > 50 explains everything.
3. **Don't accept a repeat inside a scattered-light ramp.** Reject recovered events where the QLP background varies more than about 10× its sector median within ±1 d, or where r(SAP, background) > 0.9. Require the repeat to appear in SAP or `SYS_RM_FLUX`, not only in `DET_FLUX`. The S87 "repeat" also had a depth 4× the original's at face value.
4. **Don't promote a single to "periodic" on one spacing between two QLP-only events.** At minimum, require both events to pass the pixel-level checks first.
5. **Check the variability finding.** The "12 h pulsations, about 1 ppt" removed by the vet do not appear in a periodogram of the same data (semi-amplitude 0.075 ppt, FAP 0.09). The pulsation fit may be absorbing noise.

## Files

Scripts: `common.py`, `lcio.py`, `measure.py`, `step1_tic.py`, `step1_products.py`, `step1_gaia.py`, `step1_gaia2.py`, `step1_download.py`, `step2_look.py`, `step2_archival.py`, `step2_own_phot.py`, `step3_flags.py`, `step3_s87.py`, `step3_step_vs_box.py`, `step4_pixel.py`, `step5_search.py`, `step5_extra.py`, `step6_fit.py`, `step7_catalogs.py`. Run them with `../.venv/bin/python -W ignore` from this folder.

Data (`data/`): `tic.json`, `gaia_2arcmin.csv`, `step1_gaia.txt`, `step1_gaia2.txt`, `step1_products.txt`, `step2_archival.json`, `step2_own_phot.json`, `step3_flags.json`, `step3_s87_bkg_and_cutout_stars.json`, `step3_step_vs_box.json`, `step4_pixel.json`, `step5_search.json`, `step5_extra.json`, `step6_fit.json`, `step7_catalogs.txt`, `exofop.json`. The downloads are in `lc/` and `tesscut/`.

Figures (`figs/`): `step2_window_s7.png`, `step2_window_s87.png`, `step2_own_phot.png`, `step3_flags_s7.png`, `step3_flags_s87.png`, `step4_pixel_s7.png`.
