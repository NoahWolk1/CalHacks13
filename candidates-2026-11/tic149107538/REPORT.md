# TIC 149107538 (TYC 8878-791-1 = ASASSN-V J052334.07-612437.0): follow-up of the single-transit find (BTJD 3127.761, S67)

Analysis run 2026-11-02/03. It uses public data only: MAST light curves (TESS-SPOC 200-s FFI for S61–69, SPOC 2-min for S96, QLP for 40 sectors S2–98, TARS for S66–68), TESScut for S67, 15 other TESS-SPOC S67 light curves on the same CCD, the TIC 8.2, Gaia DR3 (ESA archive, including NSS and variability tables), SIMBAD (CfA mirror, including its TAP measurement tables), the AAVSO VSX API, and read-only ExoFOP pages and TOI/CTOI lists. Nothing was submitted anywhere.

## Verdict: **stellar variability, made into a "transit" by detrending.** The dip is the bottom of a rotational minimum of a spotted, fast-rotating subgiant, most likely an RS CVn-type binary. It is not a planet candidate

**The host is a spotted subgiant that is almost certainly a spectroscopic binary.**
* Gaia DR3 gives ϖ 2.420 ± 0.012 mas (413 pc), M_G 3.36, and FLAME R = 2.73 R☉, M = 1.19 M☉, logg 3.55. It is a K-type subgiant / low RGB star, so the TIC radius (2.69 R☉) is right.
* It rotates in **P_rot = 6.10 d**, with the same period in all 49 sectors from 2018 to 2025. The peak-to-peak amplitude is 16–86 ppt. VSX lists it as ASASSN-V J052334.07-612437.0, type ROT, P = 6.1255 d.
* APOGEE measures **v sin i = 22.9 km/s**. That equals the equatorial speed 2πR/P_rot = 22.6 km/s, so the star rotates about 10 times faster than a single subgiant should, with a spin axis near the sky plane.
* **Its radial velocity varies by tens of km/s.**
  * Gaia DR3 has 16 transits with rv_chisq_pvalue 0.0, renormalised GoF 58.7 and **rv_amplitude_robust 126 km/s**. The Gaia mean RV is 14.9 ± 13.8 km/s.
  * Other single epochs: APOGEE DR17 +50.2 km/s; RAVE −14.4 km/s (2006) and −12.5 km/s.
  * The rapid synchronous-looking rotation plus the RV variability is the RS CVn signature: a tidally locked binary with P_orb ≈ P_rot. This is not proven here, because no RV orbit exists. Gaia has no NSS solution.

**The dip is a property of how the rotational minimum is modelled. It is not an extra signal.**
1. **The event sits at the bottom of a rotational minimum**, 0.11 d from the minimum of a −35 ppt trough. It is also 1.12 d after the S67 start.
2. **Nine of the eleven times the vet reported fall on rotational minima.** These are the event and the 10 "recovered" dips: 9 lie within 0.17 d of a local minimum of the light curve, and S96's four "transits" are four consecutive minima 6.1 d apart. The chance of that, if the dips were unrelated to rotation, is about 3×10⁻¹⁰ (5.6% of the cycle each). The vet's P = 197.7 d "period" is a chain of rotation minima.
3. **A vet-like running-median detrend (1.33 d) manufactures dips at minima.**
   * At the event it gives 3.3 ppt. Its deepest "dips" all sit at strong positive curvature, i.e. at minima, with r(depth, curvature) = +0.36.
   * The arithmetic: a running filter of width w through a trough of amplitude A leaves a deficit of A·(1 − sinc(πw/P)). For A ≈ 35 ppt and w = 1–1.33 d that is **1.5–2.7 ppt**, which matches the sweep's 1.9 ppt.
4. **With the rotation modelled, the dip is ordinary.**
   * Model: a per-orbit harmonic model of P_rot (3 harmonics, amplitudes linear in time, plus a quadratic), fitted jointly with the 8 h trapezoid.
   * Depth: **1.10 ppt** against a robust scatter of 0.64 ppt over ~300 independent 8 h positions in S61–69 and S96.
   * Rank: 54th deepest. **56 dips and 49 brightenings** are at least that large (equal rates mean noise).
   * A local quartic gives 0.87 ppt, rank 48, with 54 dips and 47 brightenings at least as large.
   * The value moves between 0.39 and 1.10 ppt depending only on the number of harmonics and the binning (`step6_baseline.py`).
   * An injected 1.91 ppt dip at the event is recovered at 1.91 ppt, so the model does not hide a real transit of the sweep's depth.
5. **QLP's own detrended flux (`DET_FLUX`) shows nothing**: 0.21 ± 0.27 ppt.

**Even a real 8 h transit would be awkward for this host.**
* A central transit of this star lasts 10.5 h at P = 10 d, 15 h at 30 d and 28 h at 200 d. The coverage allows only P > 87 d, which needs b ≳ 0.97 for 8 h.
* A fit to the harmonic-model residual gives 0.53 ppt, T14 5.7 h, and ρ★ 7.7× the star's density (at P = 30 d).

**Confidence:** high (>95%) that there is no planetary transit at BTJD 3127.76. A residual ≤1 ppt feature at the minimum cannot be distinguished from spot-modulation residuals, and nothing requires it.

## Status of each step

| # | Step | Status |
|---|---|---|
| 1 | Host: TIC 8.2, Gaia DR3 (astrometry, RUWE/IPD, NSS, RV, FLAME/GSP-Phot, vari tables), SIMBAD RVs and v sin i | **verified**: subgiant R 2.73 R☉; P_rot 6.10 d; v sin i 22.9 km/s; RV-variable (Gaia amplitude 126 km/s; APOGEE +50, RAVE −14/−13 km/s). No NSS solution for the target or any neighbour within 2′ |
| 2 | Depth in TESS-SPOC SAP/PDCSAP, QLP SAP/SYS_RM/DET, TARS, own TESScut (6 radii × 2 backgrounds); rotation modelled; re-centred; injection | **verified**: 0.4–1.1 ppt after modelling rotation (model-dependent); QLP DET 0.2 ± 0.3; 1.9 ppt is not reproduced except by running-filter detrending |
| 3 | Quality flags, momentum dumps, orbit edge, background, jitter, 15 same-CCD stars | **verified**: no flags in the event; nearest dump at the sector start (3126.64, 1.1 d before); background −2 e⁻/s of 1010; jitter 0.95×. Same-time 8 h depths on 15 other stars: median +0.09 ppt, one at 2.5σ (0.25 ± 0.10 ppt) |
| 4 | Per-pixel joint fit, Gaia neighbours' required eclipse depths | **run**: the event has SNR 2.1 (white) in the per-pixel fit and cannot be localised; the rotation signal is centred on the target. Neighbours could only make it with 3–90% eclipses (see §4), but there is no significant signal to attribute |
| 5 | All sectors: dip/brightening counts, where the vet's repeats sit, allowed periods, fold on P_rot | **verified**: 9 of 11 vet times are at rotation minima; dips equal brightenings; the 197.7 d period is spurious. No eclipse is seen at P_rot (folded residual within ±0.4 ppt) |
| 6 | Expected duration, batman fit, density | **run**: an 8 h chord needs b ≳ 0.97 at the allowed P > 87 d; the face-value fit is 0.53 ppt, 5.7 h, ρ 7.7× host |
| 7 | ExoFOP / TOI / CTOI / VSX / SIMBAD / VizieR | **partial**: no TOI, CTOI, imaging, spectra or companions on ExoFOP. VSX: ROT, P 6.1255 d. SIMBAD: TYC 8878-791-1, 3 RVs and v sin i. VizieR unreachable (CfA 502, CDS timed out) |

---

## 1. Host star (`data/tic.json`, `data/gaia.json`, `data/step1_gaia.txt`, `data/step7_simbad_mes.json`)

| Quantity | Value |
|---|---|
| Names | TYC 8878-791-1, RAVE J052334.1-612437, 2MASS J05233406-6124369, Gaia DR3 4757908287398076032, ASASSN-V J052334.07-612437.0 |
| Photometry | G 11.445, BP−RP 1.133, V 11.68, T 10.85, J/H/K 10.01/9.54/9.37 |
| Gaia astrometry | ϖ 2.4204 ± 0.0118 mas, μ (2.59, −3.36) mas/yr, RUWE 0.86, AEN 0.09 mas (sig 11), ipd_frac_multi_peak 0, ipd_gof_harmonic_amplitude 0.013, non_single_star 0 |
| Gaia RV | 14.9 ± 13.8 km/s from 16 transits, **rv_chisq_pvalue 0.0, rv_renormalised_gof 58.7, rv_amplitude_robust 126.2 km/s**, template 4750 K |
| Other RVs (SIMBAD) | APOGEE DR17 (2022ApJS..259...35A) **+50.21 ± 0.06**; RAVE (2017AJ....153...75K, MJD 54035.7) **−14.4 ± 9.8**; RAVE DR6 (2020AJ....160...83S) −12.5 ± 9.5 km/s |
| v sin i | **22.9 km/s** (APOGEE) |
| Gaia FLAME / GSP-Phot | **R 2.73 R☉**, M 1.19 M☉, L 4.19 L☉, age 6.1 Gyr, evolstage 567 (post-main-sequence); Teff 4997 K, logg 3.55, [M/H] −0.14, A_G 0.17; ESP-HS type K; DSC binary probability 6×10⁻⁵ |
| Gaia variability | phot_variable_flag VARIABLE; G range 0.14 mag over 35 epochs; not in any vari classifier table (no rotation-modulation entry) |
| Derived | M_G 3.36; ρ★ 0.059 ρ☉; 2πR/P_rot = 22.6 km/s ≈ v sin i, so sin i ≈ 1 for the spin |
| TIC 8.2 | Teff 4969 K, R 2.69 R☉, d 412.5 pc, lumclass GIANT, no mass |

**Reading.** Single subgiants spin down to a few km/s. A 2.7 R☉ star rotating synchronously at 6.1 d with large spots and a radial velocity varying by tens of km/s matches an RS CVn binary. If P_orb = P_rot and the Gaia robust amplitude ≈ 2K, then K ≈ 63 km/s, f(M) ≈ 0.16 M☉ and M₂ ≳ 0.85 M☉ (a ≈ 18 R☉ ≈ 6.5 R★). That orbit is an inference, not a measurement. Gaia gave no SB1 solution (rv_method 1, 16 transits). No eclipses at 6.1 d are seen (§5), so if the orbit is synchronous it does not eclipse at this depth level.

**Neighbours.** The closest is Gaia DR3 4757908287396465408 (TIC 734327163) at 2.35″: G 18.15 (T ≈ 17.5), ϖ 1.82 ± 0.20 mas, RUWE 1.33, BP/RP excess 12.5 (contaminated by the target). Its parallax is 3σ from the target's, so it may or may not be bound. No neighbour within 2′ has an NSS entry. The brightest within 90″ is TIC 149107546 (T 12.5, 89″).

## 2. Depths (`data/step2_archival.json`, `data/step2_model.json`, `data/step4_diffimage.json`, `data/step6_baseline.json`, `figs/step2_window_s67.png`, `figs/step2_model.png`)

The S67 light curve, orbit 1: the flux falls from −10 to −38 ppt at the event and rises to +30 ppt by 3130.5. The event is the trough of the rotation curve (`figs/step2_window_s67.png`).

| Product / model (S67) | Depth [ppt] |
|---|---|
| `measure.py`: trapezoid + quadratic, ±1 d. TESS-SPOC SAP / PDCSAP | 1.10 ± 0.58 / 1.12 ± 0.64 (β 3.7–3.8; 5% of slid positions deeper) |
| same, QLP SAP / SYS_RM / **DET_FLUX** | 1.14 ± 0.71 / 1.05 ± 0.72 / **0.21 ± 0.27** |
| same, TARS | 0.82 ± 1.17 |
| local polynomial, ±1–2 d, order 2–5, TESS-SPOC SAP | 0.59–5.2 (order 2 over ±2 d gives 5.2; the cubic to quintic give 0.6–1.5) |
| harmonic P_rot model, joint fit, TESS-SPOC SAP | 0.39–1.10 (2–5 harmonics, binned/unbinned); 0.47 ± 0.43 when P is free, which runs to 6.7 d over one 8 d orbit |
| harmonic model with the trough masked before fitting | unstable (−8.6 to +28.6): masking the minimum near the sector start leaves the baseline unconstrained |
| own TESScut, r = 1–4 px, global or annulus background: harmonic / local quartic | 0.11–0.64 ± 0.19–0.29 / 0.91–1.09 |
| injection of 1.91 ppt, 8 h at TC, harmonic model | recovered 1.91 |
| re-centred (harmonic residual, grid over tc and 2–16 h) | no stable minimum: the best is 0.65 ppt / 6 h at 3127.78 in QLP, and a brightening in TESS-SPOC SAP |

The depth is set by the choice of baseline across a ±35 ppt trough, not by the data. No estimator that models the rotation gives the sweep's 1.9 ppt.

## 3. Systematics (`data/step3_flags.json`, `figs/step3_flags.png`, `data/step3_neighbors.json`)

* **Quality flags.** None in the event; 100% of cadences have quality = 0.
* **Momentum dumps and orbit edge.** There is a dump at the S67 start (3126.64), 1.12 d before the event. The others are at 3133.32, 3140.46 and 3147.92. The event's ±1 d baseline window reaches back to 0.12 d after the sector start.
* **Background.** The aperture sum is 1010 e⁻/s against a stellar flux of 6782 e⁻/s. The in-event change is −2.1 e⁻/s, i.e. ≤0.3 ppt even if fully mis-subtracted. Within ±1.5 d, r(flux, background) = −0.37, because both trend across the trough.
* **Jitter.** The in/out ratio is 0.95. The centroid shift is (2.6, 2.0) mpx, consistent with the rotation-driven centroid slope of the sector.
* **15 other TESS-SPOC S67 stars** (camera 4 CCD 4, T 8.6–11.5, 0.09–0.34° away), same `measure.py` box:
  * SAP depths range from −0.29 to +0.65 ppt, median +0.09.
  * One star (TIC 149107585, 0.10° away) shows 0.25 ± 0.10 ppt (2.5σ).
  * There is no common-mode dip at the sweep's depth.

## 4. Location (`data/step4_diffimage.json`, `figs/step4_diffimage.png`)

* **Per-pixel fit.** The joint per-pixel fit (harmonic model + trapezoid) on the S67 TESScut gives an event depth of 0.43 ppt in r = 2 px at **SNR 2.1** (white noise). Its centroid is (−2.3, −6.5)″ from the target, which means nothing at this SNR.
* **The rotation signal.** Its amplitude image is centred on the target, (0.0, +8.2)″, inside 0.4 px. The 5% modulation is the target's.
* **Eclipse depth each neighbour would need:**

| Neighbour | Separation | T (est.) | Needed for 1.91 ppt | Needed for 1.1 ppt |
|---|---|---|---|---|
| Gaia DR3 …6465408 | 2.3″ | 17.5 | 90% | 52% |
| Gaia DR3 …8374016 | 37″ | 17.5 | 86% | 50% |
| Gaia DR3 …7813760 | 52″ | 16.7 | 41% | 24% |
| Gaia DR3 …7814784 | 60″ | 14.4 | 4.8% | 2.8% |
| Gaia DR3 …3382784 | 64″ | 15.5 | 14% | 8% |
| TIC 149107546 | 89″ | 12.5 | 0.9% | 0.5% |

  The table ignores PSF weighting. The 60–89″ stars are 3–4 px away and would be strongly down-weighted in the 2-px aperture, so the true required depths are higher. None of this needs resolving, because there is no significant event to attribute.

## 5. All sectors (`data/step5_search.json`, `data/step5_minima.json`, `data/step3_variability.json`, `figs/step5_depth_vs_curvature.png`)

* **Rotation.** The Lomb–Scargle peak is at 6.08–6.19 d in every TESS-SPOC/SPOC sector and 46 of 49 QLP sectors. The exceptions are S7–9, which peak at the 3.0 d harmonic, and S28, a QLP systematic. The combined S61–69 peak is 6.104 d (power 0.84).
* **Dips vs brightenings** among about 300 independent 8 h positions (S61–69, S96):

| Estimator | Event depth | Event rank | Dips ≥ event | Brightenings ≥ event | r(depth, curvature) |
|---|---|---|---|---|---|
| harmonic P_rot model | 1.10 ppt (σ_rob 0.64) | 54 / 303 | 56 | 49 | +0.04 |
| local quartic ±1.5 d | 0.87 ppt (σ_rob 0.54) | 48 / 262 | 54 | 47 | +0.05 |
| running median 1.33 d (vet-like) | 3.26 ppt | 7 / 294 | 10 | 7 | **+0.36** |

  With the rotation modelled, the depth does not correlate with curvature. The running-median depth does, which shows that detrending makes the dips. The event's local curvature (+45 ppt/d²) is in the 93rd percentile: it sits at one of the sharpest minima.
* **Where the vet's dips sit** (`step5_minima.py`), measured as the offset from the nearest minimum of the 12 h-smoothed light curve:
  * 3127.76 −0.11 d; 3048.54 +0.03; 3060.62 +0.13; 3103.26 +0.12; 3115.43 +0.12
  * 3912.76 −0.08; 3918.51 +0.17; 3924.76 −0.05; 3930.84 −0.04 (S96: four consecutive minima)
  * 3055.79 and 3720.74 (QLP S89) are off-minimum, at 54% and 27% of the range.
  * 9 of 11 are within 0.17 d of a minimum, against 5.6% expected per event.
* **The vet's other flags.** The 197.69 d ephemeris, the "secondary at phase 0.78" and the "brightening at phase 0.18" are all products of this, and are moot.
* **Fold of the harmonic residuals on 6.104 d (S61–69).** The binned residual stays within −0.41 to +0.40 ppt (rms 0.17). There is no eclipse at the rotation period. Spot evolution and any P_orb ≠ P_rot would smear an eclipse, so this is not a strict limit.
* **Allowed periods.** With S61–69 and S96 coverage, P > 86.7 d. Only 0.3% of 1–100 d is unexcluded.
* **Not examined.** The largest residual features (S62 2994.1–2994.8, S64 3053.6–3054.0, S68 3163.9–3164.1, S69 3201.9–3202.5) are dip-plus-brightening pairs of 10–47 ppt, probably flares (common on RS CVn stars) or systematics. They were not examined further.

## 6. Shape and size (`data/step6_fit.json`)

| Quantity | Value |
|---|---|
| Host | R 2.73 R☉, M 1.19 M☉, ρ★ 0.059 ρ☉ |
| Central T14 at P = 5 / 10 / 30 / 100 / 200 d | 8.4 / 10.5 / 15.1 / 22.6 / 28.4 h |
| b needed for 8 h at P = 10 / 30 / 100 / 200 d | 0.68 / 0.88 / 0.97 / 0.998 |
| Radius for 1.1 / 1.91 ppt | 9.9 / 13.0 R⊕ |
| batman fit on the harmonic-model residual (P fixed at 30 d, joint baseline) | depth 0.53 ppt, k 0.023, b 0.67, a/R 31, **T14 5.7 h**, ρ★ 0.45 ρ☉ = **7.7× the host's**; Δχ² 19 (white noise; β 1.5–3.8, so about 2σ) |

At the only allowed periods (P > 87 d), an 8 h transit would have to be a near-graze. The face-value fit is too short for the star and is not significant once red noise is counted.

## 7. Catalogs (`data/step7_catalogs.txt`, `data/step7_simbad_mes.json`, `data/exofop.json`)

* **ExoFOP.** No TOIs, CTOIs, planet parameters, imaging, spectroscopy or stellar companions. Not in the TOI list (8152 lines) or the CTOI list (5140 lines).
* **AAVSO VSX API, 72″ radius.** The target is **ASASSN-V J052334.07-612437.0, ROT, P 6.1255 d, V 11.62–11.73**. Also listed: Gaia DR3 4757908493556505344 at 67″ (G 16.1, type RS).
* **SIMBAD.** TYC 8878-791-1, type `*`, 5 references, 3 RVs (+50.2, −14.4, −12.5 km/s) and v sin i 22.9 km/s.
* **VizieR.** Unreachable (CfA returned 502; CDS timed out), so the VizieR copies of VSX, the TESS EB catalog, the Gaia classifier and ASAS-SN were not queried.

## What would change the verdict

* **A transit of the same depth and duration away from a rotation minimum**, in a well-sampled stretch, recovered with the rotation modelled. None exists in 9 TESS-SPOC/SPOC sectors.
* **Multi-epoch RVs.** They would establish the binary orbit; they cannot rescue the dip.
* **A rotation model that leaves a ≥2 ppt, 8 h residual** at the event, while dips and brightenings stay unequal elsewhere. Every model tried here leaves ≤1.1 ppt, with dips ≈ brightenings.

## Not checked

* An RV orbit: Gaia epoch RVs are not public for this star (has_epoch_rv False).
* A GP rotation model: celerite/george are not installed. Harmonic and polynomial models were used instead.
* The large dip/brightening pairs listed in §5 (probable flares).
* VizieR catalogs (servers down).
* ASAS-SN photometry itself (only the VSX entry).
* QLP S89 3720.74 in pixels.
* TESScut for sectors other than S67.

## Pipeline notes

1. **Never box-search a running-median-detrended light curve of a high-amplitude rotator near extrema.** A filter of width w through a sinusoid of amplitude A and period P leaves a fake dip of A·(1 − sinc(πw/P)) at every minimum, and a fake brightening at every maximum. Here that is 1.5–2.7 ppt. Model the rotation (harmonics or GP) jointly with the box, or use a filter much shorter than P/6.
2. **Add a "dips phase-locked to rotation minima" check.** When most single events or "repeats" fall within ~0.1 P_rot of light-curve minima, flag stellar variability. Here it was 9 of 11.
3. **The model-shift / uniqueness flag was right.** The vet itself found brightenings as strong as the dip. That flag should veto a single-event candidate, not just annotate it.
4. **The "period recovery" stage chained rotation minima into a 197.7 d ephemeris.** Recovery should require that the repeats not coincide with a known variability phase.
5. **A large Gaia rv_amplitude_robust with v sin i ≈ 2πR/P_rot** is a cheap RS CVn flag for subgiant hosts.

## Files

Scripts (run with `../.venv/bin/python -W ignore` from this folder):
* `step1_tic.py`, `step1_gaia.py`, `step1_products.py`, `step1_download.py`, `step1_tesscut.py`
* `step2_look.py`, `step2_archival.py`, `step2_model.py`
* `step3_variability.py`, `step3_flags.py`, `step3_neighbors.py`
* `step4_diffimage.py`
* `step5_search.py`, `step5_minima.py`
* `step6_fit.py`, `step6_baseline.py`
* `step7_catalogs.py`, `step7_catalogs2.py`
* plus `lcio.py`, `measure.py` and `common.py`

Figures (`figs/`): `step2_window_s67.png`, `step2_all_spoc.png`, `step2_model.png`, `step3_flags.png`, `step4_diffimage.png`, `step5_depth_vs_curvature.png`.
