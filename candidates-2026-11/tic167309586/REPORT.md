# TIC 167309586: follow-up of the duotransit candidate (1416.784 / 2325.862)

Analysis run 2026-11-01. It uses real TESS data from MAST (SPOC 2-min, TESS-SPOC FFI, QLP, TESScut) and Gaia DR3. ExoFOP was read but not written to: it lists 0 TOIs, 0 CTOIs, no imaging and no spectroscopy for this star. Nothing was submitted anywhere.

## Verdict: **systematic artifact**

The dips come from PDC detrending (PDCSAP) at momentum dumps, data gaps and scattered-light edges. The star does not produce them.

* **No dip in raw flux.** None of the four claimed events (1416.784, 2325.862, 3150.98, 3767.99) shows up in raw SAP flux or in my own TESScut aperture photometry. Raw and pixel depths are **-0.7 to +0.2 ppt**, with sigma 0.1-0.5 ppt.
* **Sensitivity is not the problem.** A 1.14 ppt, 8 h transit injected at the same epochs is recovered at **7-9 sigma** (S37, S67 SAP, S90) and **3-5 sigma** (S4).
* **Each dip matches a jump in the PDC correction** (PDCSAP/SAP) right next to a momentum dump, a data gap or the start of scattered light.
* **No other star shows them.** About 10 bright stars per sector on the same CCD show no dip at the same times.
* **The vet's period fails.** At P = 106.87 d, 7 more covered epochs in sectors 8, 12, 27, 31, 39, 63 and 67 are flat and exclude 1.14 ppt. Every duotransit alias 909.08/n for n = 2...80 is also excluded. Only n = 1 survives, and only because none of its other predicted epochs falls in data.
* **The Gaia companion is real but unrelated.** Gaia DR3 finds an astrometric acceleration (a companion that is at least brown-dwarf mass, more likely stellar, with a period of years). That companion cannot make an 8 h, ~1 ppt dip, and the dips are not astrophysical in any case.

## Status of each step

| # | Step | Status |
|---|---|---|
| 1 | TIC parameters, every MAST product (S1-S98), TESScut, tess-point | **verified** (S98 is the last sector on silicon and in MAST) |
| 2 | Event depths in SPOC SAP and PDCSAP, TESS-SPOC SAP and PDCSAP, QLP SAP and KSPSAP/DET, own photometry (2 apertures x 2 backgrounds), injection-recovery, PDC-correction check | **verified**: the dips appear only in PDCSAP |
| 3 | Systematics: flags, momentum dumps, gaps, scattered light; same-time dips on other stars; gap-edge statistics | **verified** |
| 4 | Gaia DR3 NSS tables, RUWE, RV; Gaia neighbours within 2'; difference images | **verified**. Localisation is impossible because there is no flux loss in the pixels |
| 5 | Vet's P = 106.8732 d on all sectors; duo aliases 909.08/n for n = 1..80 | **verified** |
| 6 | Duration physics; joint batman fit with free b and rho* | **run**, fitted to the PDCSAP-only signal |
| - | SIMBAD / VizieR (VSX) | **failed**: CDS servers timed out (connection errors). The VSX "ROT" entry is taken from our vet record, not re-checked |

---

## 1. Target and data

TIC 8.2 lists Teff 5259 +/- 105 K, logg 4.61, R* 0.776 +/- 0.037 Rsun, M* 0.90 +/- 0.11 Msun, rho* 1.93 +/- 0.39 rho_sun, Tmag 10.155, d 99.96 pc and contratio 0.005. Gaia DR3 5266418602628805888 gives G 10.69, BP-RP 1.03 and parallax 10.03 +/- 0.05 mas. FLAME gives R 0.82 Rsun and M 0.85 Msun.

The star sits near the southern continuous viewing zone, always on camera 4. tess-point puts it on silicon in 42 sectors: 1-4, 6-13, 27-34, 36-39, 61-64, 66-69, 87-90 and 93-98.

Downloaded:
* **33 SPOC 2-min LCs** (S1-13, 27-39, 87-97). The sweep did not use these.
* **32 TESS-SPOC FFI LCs**
* **41 QLP LCs**
* **25x25 TESScut cutouts** for S4, S37, S67 and S90

Nothing is available after S98.

## 2. Event depths in every reduction

**Method.** I fit an 8 h trapezoid at the claimed epoch with a quadratic (and cubic) baseline for each data segment within +/-1 d, using quality = 0 cadences only. The adopted error is sigma = max(sigma_white x beta, sigma_emp), where sigma_emp comes from sliding the same fit across the rest of the sector. Results are in `data/step2_archival.json` and `data/step2_own_phot.json`.

| Event | Product | Depth [ppt] |
|---|---|---|
| **S4 1416.784** | SPOC 2-min **PDCSAP** | **2.23 +/- 0.87** |
| | SPOC 2-min SAP | -0.31 +/- 0.35 (cubic: -0.38 +/- 0.23) |
| | TESS-SPOC SAP / PDCSAP | -0.05 +/- 0.22 / 0.17 +/- 0.29 |
| | QLP SAP / KSPSAP | -0.12 +/- 0.30 / -0.27 +/- 0.25 |
| | Own photometry, r = 1.5 / 2.5 px | -0.38 +/- 0.55 / -0.11 +/- 0.26 |
| **S37 2325.862** | TESS-SPOC **PDCSAP** | **1.62 +/- 0.55** |
| | SPOC 2-min PDCSAP | 0.49 +/- 0.18 |
| | SPOC 2-min SAP / TESS-SPOC SAP | 0.18 +/- 0.13 / 0.13 +/- 0.11 |
| | QLP SAP / KSPSAP | 0.10 +/- 0.13 / 0.08 +/- 0.13 |
| | Own photometry, r = 1.5 / 2.5 px | 0.21 +/- 0.12 / 0.12 +/- 0.11 |
| **S67 3150.98** | TESS-SPOC **PDCSAP** | **2.29 +/- 0.30** (cubic: 1.75 +/- 0.38) |
| | TESS-SPOC SAP | -0.12 +/- 0.13 |
| | QLP SAP / DET | -0.48 +/- 0.49 / 0.01 +/- 0.12 |
| | Own photometry, r = 1.5 / 2.5 px | -0.24 +/- 0.20 / -0.67 +/- 0.51 |
| **S90 3767.99** | SPOC 2-min PDCSAP | -0.46 +/- 0.36 at the claimed tc; the deepest point of a +/-0.6 d scan is **2.06 ppt at tc = 3768.17**, the first cadence of a data gap |
| | SPOC SAP | -0.32 +/- 0.15; scan maximum 1.04 ppt at 3768.17 (gap edge) |
| | QLP SAP / DET | -0.38 +/- 0.14 / -0.29 +/- 0.14 |
| | Own photometry, r = 1.5 / 2.5 px | -0.47 +/- 0.16 / -0.34 +/- 0.14 |

**Background test.** Depths change by less than 0.3 ppt between the global-sky and annulus background methods.

**Comparison stars in the cutouts.** No significant dip.

**Injection-recovery** (`data/step2_injection.json`). I injected a 1.14 ppt, 8 h transit into the own-photometry and SAP series at each epoch:

| Sector | Recovered, own photometry | Recovered, SAP | Native depth |
|---|---|---|---|
| S4 | +1.09 ppt (4.2 sigma) | +1.07 to +1.09 ppt (3.1-4.7 sigma) | -0.3 to -0.05 |
| S37 | +1.07 ppt (9.3 sigma) | 8.3-9.4 sigma | <= 0.2 |
| S67 | 2.1 sigma (scattered light) | +1.08 ppt (8.4 sigma) | -0.7 to -0.1 |
| S90 | 7.6 sigma | 7.0 sigma | -0.3 |

A real event of the claimed size would have been seen.

**PDC correction** (PDCSAP/SAP; `figs/pdc_correction.png`, `data/step2_pdc.json`):

| Sector | Product | Correction before / in event / after [ppt] | Trapezoid fitted to the correction alone |
|---|---|---|---|
| S4 | SPOC | -0.85 / +0.52 / **+7.0** (jump at the dump) | **2.56 ppt**, the same as the PDCSAP "transit" |
| S37 | TESS-SPOC | -1.53 / -1.72 / **+2.1** (step at the dump) | 1.49 ppt |
| S67 | TESS-SPOC | -0.17 / **-5.0** / -5.4 (step down at 3150.75) | 2.40 ppt |
| S90 | SPOC | -0.83 / +0.15 / **+4.1** (step across the gap) | - |

CROWDSAP is 0.989-0.998, so crowding is not the cause.

## 3. Systematics

Flags, dumps and gaps come from `step3_flags.py`.

| Event | Where it falls |
|---|---|
| S4 1416.784 (window 1416.62-1416.95) | Egress coincides with a **momentum dump plus coarse pointing at 1416.935-1416.948**. Then "Manual exclude" until 1417.97, and the instrument was off 1418.49-1421.21. QLP flags scattered light (Straylight2) from 1416.885. In the FFI products the window ends at a gap. |
| S37 2325.862 | Momentum dump at **2326.29-2326.30**, 0.26 d after egress; QLP flags a desat at 2326.046. Two impulsive-outlier cadences fall inside the event (TESS-SPOC). |
| S67 3150.98 | **Last ~0.6 d of usable TESS-SPOC data.** From 3151.42 the cadences are flagged "Insufficient targets for error correction" and then Straylight2. QLP background rises steeply from 3151. PDCSAP steps down by 5 ppt at 3150.75; SAP is smooth. |
| S90 3767.99 | Window ends at a **data gap 3768.19-3768.41** that closes with a momentum dump at 3768.40. The pipeline dip is the last ~0.2 d before the gap. |

**Other stars at the same times** (`data/step3_neighbors.log`). I checked 10 stars with Tmag 7.5-8.5 within 2 deg on the same camera and CCD in each event sector (S4 and S90 SPOC; S37 SPOC and TESS-SPOC; S67 TESS-SPOC).
* All SAP and PDCSAP depths are between -0.8 and +0.6 ppt, except one S67 star at 1.5 +/- 0.8 ppt (1.8 sigma).
* There is **no common-mode dip**. The artifact is specific to this target, which is what PDC-MAP misfitting a variable star near a discontinuity looks like.

**S90 gap edge** (`data/step3_pregap.json`). An 8 h box centred on the gap start (3768.17) gives:
* neighbours' SAP: -1.3 to +0.9 ppt (median +0.4)
* the target's SAP: 1.0 ppt

This is a mild pre-gap ramp shared across the CCD.

**Gap-edge statistics for this star**, across all 33 SPOC 2-min sectors (310 windows just before gaps or dumps):

| Product | "Dip" size | Rate just before gaps/dumps | Rate at random times |
|---|---|---|---|
| PDCSAP | >= 2 ppt | **5.8%** | 0.23% (25x lower) |
| SAP | >= 1 ppt | 5.2% | 0.1% |

The claimed events are drawn from this population.

**Stellar variability.**
* Gaia DR3 flags the star VARIABLE. The vari_classifier best class is SOLAR_LIKE (score 0.05); there is no rotation-modulation entry.
* The vet found 5.32 d, 1.24 ppt spot modulation. That is what makes PDC's cotrending fits unstable at discontinuities.

## 4. Gaia DR3: multiplicity, companions, neighbours

`data/gaia_nss.json`:

| Item | Value |
|---|---|
| RUWE | **4.21** |
| non_single_star | 1 |
| astrometric_excess_noise | 0.62 mas (significance 419) |
| ipd_gof_harmonic_amplitude / ipd_frac_multi_peak | 0.006 / 0 (no resolved double) |
| nss_two_body_orbit | **no entry** (also none in nss_non_linear_spectro or nss_vim_fl) |
| nss_acceleration_astro | **Acceleration7**: accel_ra = -2.42 +/- 0.04, accel_dec = -1.80 +/- 0.06 mas/yr^2, abs(a) = 3.0 mas/yr^2, significance 68, goodness of fit 7.3 |
| Gaia RVS | 8.31 +/- 0.31 km/s; 17 transits; rv_amplitude_robust 4.09 km/s; rv_chisq_pvalue 0.14 (not significantly variable) |

**What the acceleration means.**
* At 99.7 pc, 3.0 mas/yr^2 is 0.30 AU/yr^2. This gives **m_c / r^2 >~ 7.6e-3 Msun/AU^2** (projected, photocentre, so a lower limit).
  * At r = 3 AU, m >~ 0.07 Msun.
  * At r = 5 AU, m >~ 0.19 Msun.
* An acceleration-only solution (no orbit) means the period is longer than the ~34-month DR3 baseline, so r >~ 2 AU and m >~ 0.03 Msun. The companion is most likely an M dwarf a few AU out, with a period of several years.

**Could it explain the dips?** No.
* An eclipse by (or of) a stellar companion on a multi-year orbit would last >~ 15 h. It would be several percent deep unless extremely grazing.
* There is also nothing in the pixels to explain.

The companion matters for any future claim on this star: dilution, and a TIC radius biased by the binary.

**Neighbours.** Gaia lists 112 sources within 2'. The brightest is G 12.27 at 117". Every star within 1' is fainter than G 17.5 and would need a >= 60% eclipse to make 1.14 ppt (`data/gaia_2arcmin.csv`).

**Difference images** (`figs/diffimage_s*.png`, `data/step4_diffimage.json`). The r = 2.5 px depth is:

| Sector | Depth [ppt] | Image SNR |
|---|---|---|
| S4 | -0.12 +/- 0.38 | -0.3 |
| S37 | 0.10 +/- 0.26 | 0.4 |
| S67 | -0.67 +/- 0.21 | -3.3 |
| S90 | -0.35 +/- 0.59 | -0.6 |

No pixel loses flux, so the centroid offsets are meaningless and no source can be localised.

## 5. Periods

**Vet's P = 106.8732 d, anchored at 1416.784** (`data/step5_aliases.json`, `figs/P106_epochs.png`).
* The vet's "2 more events" fail on their own terms. Its own text says 3150.98 is off-ephemeris (phase 0.23). At 3767.99 there is -0.26 +/- 0.17 ppt in SAP and -0.34 +/- 0.39 in PDCSAP; the pipeline dip sits in the gap-edge cadences.
* The vet scanned only 16 sectors. With all sectors, the covered epochs give:

| Epoch | Sector, product | SAP [ppt] | PDCSAP [ppt] |
|---|---|---|---|
| 1523.66 | S8 | -0.04 +/- 0.20 | -0.06 +/- 0.15 |
| 1630.53 | S12 | 0.11 +/- 0.18 | -0.08 +/- 0.32 |
| 2058.02 | S27 | 0.00 +/- 0.17 | 0.34 +/- 0.32 |
| 2164.90 | S31 | 0.05 +/- 0.22 | 0.08 +/- 0.69 |
| 2378.64 | S39 | -0.07 +/- 0.14 | 0.02 +/- 0.41 |
| 3019.88 | S63 | -0.17 +/- 0.15 | -0.14 +/- 0.21 |
| 3126.76 | S67 | 0.00 +/- 0.21 | -0.02 +/- 0.23 |
| 3874.87 | S94 | 0.97 +/- 0.50 (noisy segment, 1.9 sigma) | - |
| 3981.74 | S97, ends at a gap | -0.85 +/- 0.36 | - |

* Seven epochs exclude a 1.14 ppt (or the vet's 1.6-1.8 ppt) transit at > 3 sigma, in SAP **and** PDCSAP. **P = 106.87 d is ruled out.**

**Duo aliases P = 909.078/n.** For every n = 2...80 (P >= 11.4 d), at least one covered epoch excludes 1.14 ppt in SAP; n = 2 and 3 are excluded by S88 (3689.48) and S93 (3840.99). Only **n = 1 (909.08 d)** survives, untested, because its other epochs are not in the data. That does not help, because the two anchor events are themselves absent from SAP and pixels.

## 6. Duration physics and joint fit

Expected central-transit duration T14 for this star (rho* 1.93 rho_sun, k ~ 0.034):

| Period | a/R* | Central T14 | Is 8 h consistent? |
|---|---|---|---|
| 909 d | 491 | ~14.6 h | Yes, with b ~ 0.8 |
| 106.87 d | 118 | 7.2 h | Marginal: 11% long, needs mild eccentricity or rho* ~30% lower |
| 909/n | - | scales as P^(1/3) | Yes for P >~ 146 d at b = 0 |

So the claimed 8 h does not discriminate on its own.

**Joint batman fit** (`data/step6_fit.json`, `figs/jointfit_*.png`). Free b and rho*, circular orbit, fitted to the PDCSAP dips:

| Case | T14 | Depth | rho* / rho_cat | Posterior within catalog +/-2 sigma |
|---|---|---|---|---|
| P = 909.26 d (S4 + S37) | 18.6 (+1.5 / -1.0) h | 2.6 ppt | **0.20 (+0.33 / -0.11)** | 6% |
| P = 227 d (n = 4) | - | - | 0.04 | 0% |
| P = 106.88 d (S4 + S90) | 10.4 h | - | 0.07 | 0.02% |

* At 909 d the fit wants the slow PDC ramps, not an 8 h transit.
* At 106.88 d the fit puts Tc2 at **3768.21, inside the data gap**. It is fitting the gap-edge step.

These fits characterise the pipeline artifact, not a planet.

## Answers to the specific questions

* **Raw SAP and own pixels.** Absent from both, at all four epochs (<= 0.2 ppt; a 1.14 ppt injection is recovered at up to 9 sigma). The dips are created by PDC detrending of a spotted star (5.3 d rotation, red noise 3.4x white) at discontinuities.
* **Dumps, gaps, scattered light, other stars.** Every event touches a momentum dump (S4, S37, S90), a gap (S4, S90) or a scattered-light/end-of-data edge (S67). Other stars show no dip at the same times.
* **Gaia NSS.** There is no orbital solution, only an Acceleration7 solution (3.0 mas/yr^2, 68 sigma) plus RUWE 4.2. This points to a companion of >~ 0.03-0.2 Msun at >~ 2-5 AU with a period of years. It does not explain the dips.
* **Is 8 h physical?** Yes at 909 d (b ~ 0.8) and at aliases >~ 146 d; marginal at 106.87 d. The pipeline-product fits instead prefer 10-19 h and rho* 5-14x below the catalogue value.
* **Extra events at 3150.98 and 3767.99.** They do not hold up. Both are absent from SAP and pixels, both are PDC steps at a scattered-light edge or a gap, and 3150.98 is not even on the claimed ephemeris. P = 106.87 d is excluded by 7 flat epochs.
* **All sectors.** S1-S98 were used, which is everything MAST has and every sector tess-point lists.

## Files

* **Scripts:** `step1_*` ... `step6_fit.py`, with shared `lcio.py`, `measure.py` and `common.py`.
* **Data:** `data/` (TIC, Gaia, JSON results, `depthgrid.pkl`, downloaded FITS).
* **Figures** (`figs/`):
  * `raw_window_s{4,37,67,90}.png`
  * `pdc_correction.png`
  * `own_phot.png`
  * `diffimage_s*.png` and `centroid_s*.png`
  * `P106_epochs.png`
  * `jointfit_{duo_n1,duo_n4,P106_vet}.png`

## What would change the verdict

A >~ 1 ppt, ~8 h dip in **SAP and own pixel photometry**, away from dumps, gaps and scattered light, that repeats.
