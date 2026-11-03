# TIC 149538842 (WISE J054403.1−605052 = ASASSN-V J054403.12−605052.5): follow-up of the single-transit find at BTJD 3084.74 (QLP S65), with a claimed repeat at 3979.76 (S97)

Analysis run 2026-11-02 on public data only: MAST (41 QLP sectors S1–S98, TESScut for S65 and S97, QLP S65 light curves of 15 other stars on the same CCD), Gaia DR3 (ESA archive), the TIC 8.2, SIMBAD (CfA mirror, including its measurement tables), the AAVSO VSX API, and read-only ExoFOP pages and TOI/CTOI lists. Nothing was submitted anywhere.

## Verdict: **not a planet. The "transit" is a detrending artifact: QLP's detrended flux undershoots right after a stellar flare.** The S97 "repeat" is the same artifact after a second, unrelated flare

**The host is not a 0.86 R☉ dwarf.** It is an active, rapidly rotating, flaring subgiant in a spectroscopic binary, most likely an RS CVn-type system.
* The TIC radius comes from a RAVE logg of 4.53 and has no parallax behind it. The TIC itself flags the star `GIANT`.
* Gaia DR3 gives ϖ = 1.16 ± 0.15 mas, so M_G ≈ 3.05, or about 2.6 after A_G 0.49. That is about 2.5 mag above the main sequence at (BP−RP)₀ ≈ 0.95.
* Gaia radii: GSP-Phot **2.43 R☉**, FLAME **3.40 R☉** (1.46 M☉).
* Four spectroscopic surveys (APOGEE, GALAH and others) give logg **3.3–3.8**.
* vsini is 27.6 km/s (APOGEE) and 36.5 km/s (RAVE). With the 8.92 d photometric period, that needs R sin i ≥ 4.9 R☉. With half that period it needs ≥ 2.4 R☉. Either way the star is not a dwarf.
* **It is a binary.**
  * Gaia RUWE is **14.65**. The astrometric excess noise is 1.7 mas at a significance of 3518.
  * Gaia RV: the DR3 mean is 16.0 km/s with `rv_amplitude_robust` **43.8 km/s** and χ² p = 0. Gaia DR2 gave 25.8 km/s, and **APOGEE gave 56.52 ± 0.08 km/s**. The velocity changes by at least 40 km/s.
  * There is no Gaia NSS solution.
* The VSX/ASAS-SN "DCEP, P 8.92 d" classification is wrong. An 8.9 d classical Cepheid has M_V ≈ −4, not +2.6. The 8.92 d signal is spot modulation.

**The event is the decay of a flare, not a dip.**
1. **A double-peaked flare** sits 0.3 d before the event: +3.4% at 3084.46 and +1.9% at 3084.60, on a fitted Davenport template. The 6 h "transit" window (3084.615–3084.865) covers its decay. In raw QLP SAP there is no dip: the flux decays from the flare straight into the descending branch of the 8.9 d spot wave (`figs/step2_zoom.png`).
2. **Once the flare and a smooth baseline are modelled,** the depth at the vet's epoch is **−2.1 ± 1.2 ppt in SAP** (a slight excess, not a dip). It is −2.0 ± 1.5 in `SYS_RM_FLUX` and between −0.9 and −1.8 ppt in our own TESScut photometry at r = 1–4 px with two background methods.
3. **The same detrenders run on the noise-free flare + baseline model, which has no dip at all, give the same "depths" as the real data.**
   * A 0.3 d spline gives 6.0 ppt on the model and 4.0 ppt on the real data.
   * QLP's own `DET_FLUX` shows 4.1–4.9 ppt.
   * The vet's own detrending check found 3.2–6.7 ppt depending on the filter.
4. **The S97 "repeat" has the same cause.**
   * A single 2.1% flare peaks at 3979.41, 0.35 d before the "repeat".
   * With the flare modelled, the depth at 3979.76 is **0.0 ± 0.4 ppt** (SAP), and −0.9 to −1.9 ppt in our own photometry.
   * The 895 d period is the spacing of two unrelated flares.
5. **This star flares constantly, and the deepest "dips" in its detrended flux sit next to flares.**
   * The census over 41 sectors (about 1000 d) finds about 70 flare-like brightenings at ≥ 4σ in 30-min bins, up to +94 ppt.
   * Sliding the sweep statistic (6 h trapezoid, ±1 d quadratic) over the detrended flux: **21 of the 25 deepest dips (all ≥ 4 ppt) lie within 0.6 d of a census flare**. The S65 event ranks only about 23rd.
   * Two of the four that are not near a flare are gap-edge artifacts (S68 3174.9, S89 3733.3).
6. **The flare is on the target.** In both sectors the per-pixel flare amplitude peaks on the target pixel. Its centroid is within 1.7–4.9″ (≤ 0.23 px) of the target's light centroid, and the nearest Gaia neighbour of any brightness is 24″ away. Fifteen other S65 stars on the same CCD show nothing at the flare or event times.

Even a real eclipse could not be a 5.4 R⊕ planet. A depth of 3.3–4.6 ppt on a 2.4–3.4 R☉ star means **15–25 R⊕ (1.4–2.3 R_J)**. A face-value transit fit to `DET_FLUX` needs **ρ★ 20–100× FLAME's 0.037 ρ☉**: an 8 h event is too short for this star (a central transit at P ≥ 10 d lasts ≥ 12 h).

## Status of each step

| # | Step | Status |
|---|---|---|
| 1 | Host: TIC 8.2, Gaia DR3 (astrometry, RUWE, RV, GSP-Phot, FLAME, NSS, variability tables), SIMBAD measurements, neighbours' NSS | **verified**: subgiant (R 2.4–3.4 R☉, logg 3.3–3.8), RUWE 14.65, RV varies by ≥ 40 km/s. No NSS for the target or any neighbour with G < 17 within 1′ |
| 2 | Depth in QLP SAP / SYS_RM / DET / DET_SML / DET_LAG, own TESScut (6 apertures × 2 backgrounds), with and without a flare model; detrender simulation | **verified**: the depth exists only after detrending a flare. With the flare modelled it is ≤ 0 in every product. Detrending the dipless model reproduces the "dip" |
| 3 | Quality flags, gaps, background, jitter, same-CCD stars | **verified**. S65: 100% q = 0 in the event; a gap at 3083.47–3083.69 (1 d before); background flat; jitter 0.9–1.1×. S97: bit 30 on 68 cadences within ±0.5 d. Same-CCD stars: 0 of 15 > 3σ |
| 4 | Location: per-pixel fit, flare difference image, Gaia neighbours' required depths | **verified**: the flare is on the target pixel. The "dip" has no positive per-pixel signal (−0.8 / −1.5 ppt). Neighbours would need 2–59% eclipses, and there is no eclipse to explain anyway |
| 5 | All sectors: dip/brightening census, 8.9 d modulation, repeats, odd/even, secondary, periods | **run**: 21/25 deepest detrended dips are flare sidelobes; the S97 repeat is a flare artifact. Odd/even, secondary and period analysis are **moot** (no real event) |
| 6 | batman fit, implied ρ★, companion size | **run**: grazing (b 0.83–0.90), ρ★ 20–100× catalog, 15–25 R⊕ for the real star |
| 7 | ExoFOP / TOI / CTOI / VSX / SIMBAD | **run**: no TOI, CTOI, imaging or spectra on ExoFOP. VSX and SIMBAD say DCEP 8.92 d (misclassified). VizieR was unreachable (CfA 502) |

---

## 1. Host star (`data/tic.json`, `data/gaia_target.json`, `data/step1_gaia.txt`, `data/step7_catalogs2.json`)

| Quantity | Value |
|---|---|
| Names | TIC 149538842, Gaia DR3 4758589400489342080, 2MASS J05440311−6050523, UCAC4 146-006067, ASASSN-V J054403.12−605052.5, GALAH 170113002601178 |
| Photometry | G 12.73, BP−RP 1.22, V 12.85–12.95, T 12.11, J/H/K 10.99/10.43/10.30 |
| TIC 8.2 | Teff 5623 K, **R 0.858 R☉ (no parallax, no logg, no mass)**, lumclass **GIANT**, contratio 0.062. The Teff/logg 4.53 come from RAVE (2018MNRAS.473.2004S) |
| Gaia DR3 astrometry | ϖ 1.161 ± 0.152 mas (d ≈ 860 pc; GSP-Phot distance 621 pc), μ (3.79, −1.17) mas/yr, **RUWE 14.65**, excess noise 1.73 mas (sig 3518), ipd_frac_multi_peak 0, harmonic amplitude 0.025, non_single_star 0 |
| Gaia DR3 RV | 16.05 ± 5.32 km/s from 17 transits, **rv_amplitude_robust 43.8 km/s**, rv_chisq_pvalue 0.0, renormalised GoF 10.9 |
| Other RVs (SIMBAD) | Gaia DR2 25.82 ± 7.39 km/s; **APOGEE DR17 56.52 ± 0.08 km/s** (2022ApJS..259...35A) |
| vsini | 27.6 km/s (APOGEE), 36.5 ± 2.0 km/s (RAVE) |
| Spectroscopic Teff / logg | APOGEE 4286 / 3.33; 2022AJ....163..152S 5582 / 3.32; 2022ApJ...926...26S 4797 / 3.80; 2021ApJ...913...11L 5217 / 3.8; RAVE 5623 / 4.53 (the odd one out) |
| Gaia GSP-Phot | Teff 5195 K, logg 3.64, [M/H] −0.35, A_G 0.49, **R 2.43 R☉** |
| Gaia FLAME | **R 3.40 R☉, M 1.46 M☉, L 7.2 L☉**, age 3.0 Gyr, evolstage 525 (subgiant). Implied ρ★ 0.037 ρ☉ |
| Gaia MSC (two-star fit) | Teff 4877 + 4152 K; logposterior 229, better than single-star GSP-Phot (−915) |
| Gaia variability tables | none (phot_variable_flag NOT_AVAILABLE; no epoch photometry) |
| Variable class | VSX/ASAS-SN: DCEP, P 8.9196 d, V 12.90–13.08 (Jayasinghe+2019). **Not physical**: M_G ≈ 2.6 is about 6 mag too faint for an 8.9 d Cepheid |

**Interpretation.**
* The CMD position, the spectroscopic gravities and the Gaia radii all place the star on the subgiant branch: R ≈ 2.4–3.4 R☉, and more if the RUWE-affected parallax is too large.
* With an RV range of ≥ 40 km/s, RUWE 14.65, rapid rotation (vsini 28–37 km/s), an 8–16% spot wave and frequent large flares, this is a classic RS CVn-type active binary. The rotation is probably synchronised to the orbit.
* The orbit itself is not determined, because there is no Gaia NSS solution.

**Neighbours.** Sixty-five Gaia sources lie within 2′. The brightest that could matter are G 15.97 at 24″, G 15.54 at 37″, G 16.83 at 41″ (RUWE 11.8) and G 14.74 at 56″. None has an NSS solution or a Gaia variability flag.

## 2. Depths (`data/step2_archival.json`, `data/step2_flaremodel.json`, `data/step2_flarefixed.json`, `data/step2_detrend_sim.json`, `data/step4_pixels.json`)

Only QLP light curves exist for S61–98. There are no SPOC or TESS-SPOC products for this star.

**Plain `measure.py` at the vet's epoch** (6 h trapezoid; depth ± max(σ_white·β, σ_emp); β 3–6, so the noise is strongly red):

| Product | S65 @ 3084.74 [ppt] | S97 @ 3979.76 [ppt] |
|---|---|---|
| QLP SAP, ±1 d quadratic / ±0.75 d linear / ±1.5 d cubic | −4.9 / −7.7 / −4.6 (± 4.7–6.3) | +4.0 / −3.0 / +2.9 (± 2.4–4.5) |
| QLP SYS_RM_FLUX | −4.9 / −7.4 / −4.6 | +4.0 / −2.9 / +3.0 |
| QLP DET_FLUX | **+4.8 / +4.1 / +4.9** (± 1.4–1.8) | +3.8 / +1.9 / +3.7 (± 2.3) |
| QLP DET_FLUX_SML / _LAG | +4.2 / +4.9 | +1.1 / +3.9 |

* The raw SAP gives a *negative* depth (a brightening) at S65 because the flare sits inside the baseline window. The positive "transit" appears only in the detrended columns.
* The vet's "raw SAP 7.2 ppt" combined two events after its own local detrending.

**Flare + baseline model** (SAP, q = 0, ±1.5 d or ±2.5 d window).
* The model is a 3rd- or 5th-order polynomial plus Davenport (2014) flare templates, two for S65 and one for S97, plus a fixed 6 h dip at the vet's epoch.
* The error is the scatter of the same fixed-dip fit slid across the window.

| Epoch | Flare(s) | Dip at the vet's epoch [ppt] |
|---|---|---|
| S65 3084.74 | peaks 3084.461 (+3.4%, FWHM 4.6 h) and 3084.596 (+1.9%, FWHM 2.2 h) | **−2.1 ± 1.2** (SAP, ±2.5 d); −2.0 ± 1.5 (SYS_RM) |
| S97 3979.76 | peak 3979.408 (+2.1%, FWHM 4.1 h) | **+0.0 ± 0.4** (SAP, ±2.5 d); +0.15 ± 0.5 (SYS_RM) |

A free-epoch dip in the same model wanders to wherever the flare template fits worst: 3084.64 with a negative depth, and 3979.88 at +2.3 ppt.

**Detrender simulation** (`step2_detrend_sim.py`). The test applies spline (knots every 0.3, 0.5 and 1 d, with 3σ clipping) and running-median (0.63, 1 and 2 d) detrenders twice: once to the real SAP and once to the noise-free baseline + flare model, which has no dip. The 6 h depth measured at the vet's epoch:

| Detrender | S65 real | S65 dipless model | S97 real | S97 dipless model |
|---|---|---|---|---|
| spline 0.3 d | 4.0 | **6.0** | −0.6 | −0.1 |
| spline 0.5 d | 2.5 | −0.5 | 2.0 | **2.6** |
| spline 1 d | −1.5 | −2.9 | 2.1 | **2.5** |
| running median 0.63 / 1 / 2 d | −0.7 / −5.9 / −9.9 | −0.5 / −5.0 / −8.1 | 1.7 / 1.5 / 1.2 | 2.2 / 2.5 / 2.5 |
| local quadratic ±0.75 d (raw) | −0.8 | +0.6 | 4.0 | **4.4** |

In every case the dipless model tracks the real data. The "depth" is a property of how a given filter responds to the flare, which is why the vet's detrending check saw it swing from 3.2 to 6.7 ppt.

**Own TESScut photometry** (S65 and S97, 25×25 px; apertures r = 1, 1.5, 2, 2.5, 3, 4 px; global or annulus background; flare model as above):
* At the event the depth is −1.7 to −0.9 ppt in S65 and −1.9 to −0.9 ppt in S97 (white σ about 0.3–0.5 ppt). There is a small excess in every aperture and no dip anywhere.
* The flare amplitude falls from 3.0% to 2.5% (S65) and from 2.1% to 1.5% (S97) between r = 1 and r = 4 px. That is the dilution expected for light from the target, with 6% contamination in the TIC aperture and more in a larger one.

## 3. Systematics (`data/step3_flags.json`, `data/step3_neighbors.json`, `figs/step2_window.png`)

* **S65 quality flags.** 100% of event cadences have q = 0, and no flag bits are set within ±0.5 d.
* **S65 gap.** There is a downlink or orbit gap at 3083.47–3083.69, 1.1 d before the event. Before it the QLP background ramps down steeply (scattered light). From 3083.7 onward it is flat.
* **S65 jitter.** The in/out ratio of the SAP_X/Y point-to-point rms is 1.12 / 0.90, and the centroid shift is ≤ 1.3 mpx.
* **S97.** 91% of event cadences have q = 0, and 68 cadences within ±0.5 d carry bit 30 (QLP scattered-light/low-precision flag). Background and jitter are normal (ratio 0.95–0.96, shift < 0.3 mpx).
* **Same-CCD stars.** Fifteen QLP S65 light curves of other stars on camera 4 CCD 3 (T 9.2–14.6, 2.8–8.9′ away) show nothing:
  * at the event: DET_FLUX depths −1.9 to +2.3 ppt, median depth/σ −0.14, none > 3σ;
  * at the flare peak (3084.50): −1.9 to +2.4 ppt.
* Two cutout stars 4–5 px away show at most 9% of the target's fractional flare amplitude, consistent with PSF-wing leakage. Their event depths are +0.6 and −1.2 ppt (S65), and +0.7 and −2.6 ppt (S97).

## 4. Location (`data/step4_pixels.json`, `figs/step4_pixels.png`)

* **Flare.** The per-pixel fit uses a cubic baseline, the flare shape fixed from the light-curve fit with free amplitude per pixel, and a 6 h dip.
  * The flare-amplitude image peaks on the target pixel in both sectors with a PSF shape.
  * The flare centroid is offset from the target's light centroid by (−1.7, −4.6)″ in S65 and (−3.1, +0.2)″ in S97, at most 0.23 px. The nearest Gaia source brighter than G = 19 is 24″ (1.1 px) away.
  * The simple flare-peak-minus-pre-flare difference image gives the same picture.
* **"Dip".** The per-pixel dip amplitude summed over r = 2 px is −0.8 ppt (S/N −2.6) in S65 and −1.5 ppt (S/N −4.5) in S97. That is a residual of flare-shape mismatch, opposite in sign to a transit, and there is no positive deficit anywhere in the cutout.
* **Eclipse depth each neighbour would need for 3.3 ppt:**

| Neighbour | Separation | G | Required eclipse depth |
|---|---|---|---|
| 4758589366129604736 | 24″ | 15.97 | 6.6% |
| 4758589400489343744 | 37″ | 15.54 | 4.4% |
| 4758589400489343616 | 41″ | 16.83 | 14% |
| 4758589499272626048 | 52″ | 18.36 | 59% |
| 4758588988172484352 | 56″ | 14.74 | 2.1% |
| 4758589366129608064 | 87″ | 14.44 | 1.6% |

  All other sources within 90″ are too faint (G > 18.6) to produce it. None of this is needed, because there is no eclipse signal to place.

## 5. All sectors (`data/step5_var_flares.json`, `data/step5_search.json`, `figs/step5_all_sap.png`, `figs/step5_check.png`)

* **Modulation.** The Lomb–Scargle peak is at 8.76–9.43 d in almost every sector (median **8.93 d**, matching VSX's 8.92 d) with 35–161 ppt peak-to-peak. In S96–98 the peak moves to 4.43–4.45 d, the first harmonic, as is typical when spots form on opposite hemispheres.
* **Flares.** Counting runs of ≥ 2 thirty-minute bins at ≥ 4σ above a 0.5 d running median finds about 70 events in 41 sectors. Many are multi-part, and the largest reach 94, 57, 54, 44 and 44 ppt. The S65 (+3.4%) and S97 (+2.1%) flares are ordinary for this star.
* **Dips vs brightenings in the detrended flux.** The sweep statistic was slid over QLP `DET_FLUX` (S61+) or `KSPSAP_FLUX` (S1–39) every 0.05 d.
  * The 25 deepest independent dips are all ≥ 4 ppt, and **21 are within 0.6 d of a census flare**. They are flare sidelobes, typically 0.15–0.4 d before or after the peak.
  * The four exceptions: S89 3733.30 (35 ppt) and S68 3174.88 (8.3 ppt) are a segment offset after a gap with a background excursion, and a pre-gap jump respectively (`figs/step5_check.png`). The other two (S89 3734.25, S66 3111.19) are 4.2–4.4 ppt, at the level of the event itself.
  * The S65 event (4.6 ppt) ranks about 23rd. Brightenings of the same size are just as common (all top 25 ≥ 5 ppt), and they are the flares themselves.
* **Repeats, odd/even, secondary, periods.** The only "repeat" (S97) is another flare sidelobe, and the S65 event is not a dip. Period, alias, odd/even and secondary analysis are therefore **moot**. The vet's P = 895 d and its aliases (447.5, 179 d) mean nothing.

## 6. Shape and size (`data/step6_fit.json`, `figs/step6_fit.png`)

* **Face-value batman fit to S65 `DET_FLUX`** (±1 d, local quadratic, circular, quadratic limb darkening 0.45/0.20):

| | P = 895 d | P = 100 d |
|---|---|---|
| Depth | 6.0 ppt | 5.7 ppt |
| T14 | 6.8 h | 6.3 h |
| k | 0.086 | 0.079 |
| b | **0.90** | **0.83** |
| ρ★ | **3.7 ρ☉, 101× FLAME's 0.037 ρ☉** | 0.80 ρ☉, 22× FLAME |
| Δχ² vs flat | 95 | 95 |
| Δχ² when ρ★ is forced to FLAME | +61 | +30 |

* **Central T14 for the FLAME host** (3.40 R☉, 1.46 M☉): 12 h at P = 10 d, 17 h at 30 d, 25 h at 100 d, 42 h at 447 d, 52 h at 895 d. A 6–8 h event needs a graze at every period.
* **Companion size for the real star:** 3.3 ppt → 15.2 R⊕ (GSP-Phot R) or 21.3 R⊕ (FLAME R); 4.6 ppt → 18.0 or 25.2 R⊕. That is 1.4–2.3 R_J, not the vet's 5.4 R⊕, which came from the TIC's 0.86 R☉.

## 7. Catalogs (`data/step7_catalogs.json`, `data/step7_catalogs2.json`)

* **ExoFOP.** No TOIs, CTOIs, imaging, spectroscopy, time series or stellar companions. Not in the TOI list (8152 lines) or the CTOI list (5140 lines).
* **AAVSO VSX API, 3′.** WISE J054403.1−605052, **DCEP, P 8.9195531 d** (W1 amplitude 0.103). The other two entries are G ≈ 18.4–18.8 Gaia RR Lyrae 2.5′ away, irrelevant at 4–5 mag fainter.
* **SIMBAD.** Type cC* (classical Cepheid, from the same WISE/ASAS-SN classification). Variability measure DCEP, P 8.920271 d, V 12.90–13.08 (2019MNRAS.485..961J). Two RVs, two vsini and five Teff/logg/[Fe/H] entries (§1). Seven references.
* **VizieR.** The CfA mirror returned 502 for everything (VSX, the TESS EB catalogue, WDS, the Gaia SB1 tables, the WISE variables J/ApJS/237/28). These were not re-tried on CDS.

## What would change the verdict

Nothing realistic: the event is explained in the raw flux and in the pixels. To reopen the case, someone would need either:
* a dip at the vet's epoch that survives a flare-plus-baseline model, which it does not (≤ 0 ppt in every product); or
* a repeating 6–8 h dip far from any flare.

Even then, the companion would be ≥ 15 R⊕ on a subgiant in an RV-variable binary.

## Not checked

* **The binary orbit.** There is no Gaia NSS solution. The available RVs (Gaia DR2 and DR3 means, one APOGEE visit) cannot fix a period. Whether P_orb equals the 8.92 d rotation period is unknown.
* **VizieR catalogues** (CfA mirror down). The APOGEE and GALAH spectra were not examined for SB2 lines.
* **GSFC-ELEANOR-LITE, TGLC, TASOC and T16** cover only S1–13 and are irrelevant to either event.
* **ASAS-SN light curve.** The vet notes 1600 points with too few in the event.
* **Flare energies** and a formal flare frequency distribution.

## Pipeline notes

1. **Mask flares before detrending, and test each single event against them.** Find brightenings, for example ≥ 4σ runs above a running median, and mask about ±0.5 d around each before any spline or median filter. Reject single events that start within about 0.6 d of a flare peak. Here both "transits" sit 0.3 d after a flare, and 21 of the 25 deepest detrended dips do the same.
2. **Run the raw-flux check on the raw flux with a flare-aware baseline,** not after local detrending. QLP SAP gives a negative depth here (−4.9 ppt), which would have flagged the problem.
3. **Do not trust a TIC radius without a parallax.** The TIC used RAVE logg 4.53 for R = 0.86 R☉ while labelling the star GIANT. Prefer Gaia FLAME or GSP-Phot, or the spectroscopic logg consensus (here 3.3–3.8), and propagate the change into the companion radius (5.4 → 15–25 R⊕).
4. **The "recovery" check should require the repeat to survive the same artifact tests** as the original event. A repeat with the same flare-then-dip morphology is evidence of a shared systematic, not of a period.
5. **Treat VSX "DCEP" for a star with M_G > 0 as a misclassification,** and as a pointer to spot modulation and activity.

## Files

Run the scripts with `../.venv/bin/python -W ignore <script>` from this folder.

* **Helpers:** `lcio.py`, `measure.py`.
* **Scripts:** `step1_tic.py`, `step1_gaia.py`, `step1_products.py`, `step1_download.py`, `step1_tesscut.py`, `step2_look.py`, `step2_zoom.py`, `step2_archival.py`, `step2_flaremodel.py`, `step2_flarefixed.py`, `step2_detrend_sim.py`, `step3_flags.py`, `step3_neighbors.py`, `step4_pixels.py`, `step5_var_flares.py`, `step5_search.py`, `step5_check.py`, `step6_fit.py`, `step7_catalogs.py`, `step7_catalogs2.py`.
* **Figures (`figs/`):** `step2_event_sector.png`, `step2_window.png`, `step2_zoom.png`, `step2_flaremodel.png`, `step4_pixels.png`, `step5_all_sap.png`, `step5_check.png`, `step6_fit.png`.
* **Data (`data/`):** `tic.json`, `tic_120arcsec.csv`, `gaia_target.json`, `gaia_2arcmin.csv`, `step1_gaia.txt`, `step1_products.txt`, `step2_*.json`, `step3_*.json`, `step4_pixels.json`, `step5_*.json`, `step6_fit.json`, `step7_*.json`, plus the downloaded FITS files (`lc/`, `lc_neighbor/`, `tesscut/`).
