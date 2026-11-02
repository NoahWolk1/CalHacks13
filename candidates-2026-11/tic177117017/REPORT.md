# TIC 177117017: follow-up of the single dip at BTJD 1385.094

Analysis run 2026-11-01/02 on public data only: MAST light curves (QLP, TESS-SPOC, TASOC, GSFC-eleanor-lite), TESScut, Gaia DR3 (ESA archive), VizieR (CfA mirror), SIMBAD (Harvard mirror) and the TESS Sector 3 Data Release Notes (DRN). Nothing was submitted anywhere.

## Verdict: **systematic artifact**

There is also **no eclipsing binary** in this aperture. The "EB" that our vet used to reject the BTJD 1391.135 find is itself a QLP Sector 3 artifact.

* **1385.094 lies in Sector 3 ACS-testing data, not in science data.** It is not in Sector 1 as the find record says. The S3 DRN states: "Science Data Start ... TJD **1385.89663**". Before that, "the ACS feedback loop was altered and the calibration parameters tuned". The DRN says these data have "limited use for scientific applications" and SPOC excludes them (bit 8). TESS-SPOC made no S3 light curve at all.
* **The noise in that stretch is 4x normal.** My own TESScut r = 1.5 px photometry scatters by **4.2 ppt** point to point in 1384.3-1385.9, against **1.0 ppt** after 1385.95. QLP KSPSAP gives 4.8 ppt against 3.3 ppt. The "dip" is 2-3 low cadences (1385.03-1385.07), and the very next QLP cadences (1385.094-1385.323) have a **negative background (-890 to -1290)**, where the normal value is +400 to +800.
* **Depths at 1385.094 (3 h box, linear baseline, +/-0.75 d):**

  | Product | Depth [ppt] |
  |---|---|
  | own TESScut r = 1.5 px | 4.1 +/- 1.8 |
  | own TESScut r = 2.5 px | 3.6 +/- 1.9 |
  | TASOC raw | 4.5 +/- 2.3 |
  | QLP KSPSAP | 4.2 +/- 3.0 |
  | QLP SAP | -0.7 +/- 4.3 |

  These are all ~2 sigma, half the pipeline's 8.37 ppt. The vet's own re-measure got SNR 4.6. QLP has no quality = 0 coverage of the event (cov < 0.5). eleanor-lite's pre-science data ramp by >30% here, so they are unusable.
* **No 8 ppt signal in raw pixels.** A real 6.5 R_earth transit would need 8 ppt in raw pixels. Nothing outside 2 sigma is seen in any product, in data the mission itself flags as non-science. The difference image gives 3.5 +/- 1.7 ppt (SNR 2.0), which is not localisable.

## Status of each step

| # | Step | Status |
|---|---|---|
| 1 | TIC parameters, products, sectors, downloads | **verified** (24 SPOC + 42 QLP LCs, S1-S98; TESScut S3) |
| 2 | 1385.094 in every reduction (QLP SAP/KSPSAP, TASOC, eleanor, own TESScut x2 apertures) | **verified**: <=4.5 ppt, ~2 sigma, in ACS-test data |
| 3 | Same-time dips on 18 other stars (cam 4 CCD 3/4, QLP S3) | **verified**: none at any of the four S3 epochs |
| 4 | Difference images + Gaia DR3 overlay (1385.094, 1389.59, 1391.135) | **run**: no localised flux loss at any epoch. The PSF fit of the direct image was poor (sigma = 0.25 px, 18" WCS-PSF offset), so centroid numbers are indicative only |
| 5 | EB identification and characterisation | **verified: no EB exists**. All four S3 "events" are QLP artifacts; no deep eclipse in 43 sectors |
| 6 | Catalogues (Gaia vari/NSS, VSX, TESS EB catalogue, SIMBAD) | **verified**: nothing on target |
| 7 | SPOC PDCSAP for 1385.094 | **not possible**: TESS-SPOC has no S3 product |

## 1. Target

| Teff | logg | R* | M* | Tmag | G | d | contratio |
|---|---|---|---|---|---|---|---|
| 4245 +/- 128 K | 4.63 | 0.648 Rsun | 0.66 Msun | 12.26 | 13.04 | 131 pc | 0.129 |

* **Gaia DR3 5281640722640603264** *is* the target. It sits 2.3" from the epoch-2000 TIC position because of proper motion (55.6, 132.9 mas/yr). **Our vet lists this same source as a "neighbour at 2", T 12.3"** and gives it 21% of the false-positive probability. That is a pipeline bug, because the vet does not propagate proper motion to the TIC epoch.
* **The real nearest neighbour** is Gaia DR3 5281640722640603136 / TIC 177117021, at 7.1" with G = 15.16 (dG = 2.1). It is a background star (parallax 1.34 mas).
* **Data on silicon:** 43 TESScut sectors (S1-13, 27-29, 31-39, 61-69, 87-89, 93-98). MAST has no data after S98.

## 2. The four Sector 3 "events" in every reduction

Depths [ppt] are box fits with a per-segment polynomial baseline and red-noise errors (`measure.py`, same method as the reference report). Data: `data/step2_*.json`. Figure: `figs/s3_events_all_pipelines.png`.

| Event | QLP KSPSAP | QLP SAP | TASOC raw | eleanor-lite PCA | own TESScut r = 1.5 | own r = 2.5 |
|---|---|---|---|---|---|---|
| 1385.094 (3 h) | 4.2 +/- 3.0 | -0.7 +/- 4.3 | 4.5 +/- 2.3 | (corrupted, ACS test) | 4.1 +/- 1.8 | 3.6 +/- 1.9 |
| 1389.59 (6 h) | **24.9 +/- 5.2** | **25.1 +/- 4.7** | 0.0 +/- 2.3 | -2.9 +/- 6.0 | -0.2 +/- 1.9 | 0.5 +/- 2.4 |
| 1391.135 (6.8 h) | **31.7 +/- 5.9** | **31.3 +/- 5.7** | -0.1 +/- 2.4 | 2.0 +/- 6.4 | 0.0 +/- 1.7 | -0.8 +/- 1.6 |
| 1394.01 | **579 +/- 60** | **740 +/- 68** | 52 +/- 39 | 4.4 +/- 5.5 | -38 +/- 40 | -45 +/- 46 |

Using only quality = 0 cadences, own photometry gives 0.0 +/- 1.1 ppt at 1389.59 and 0.0 +/- 0.6 ppt at 1391.135.

* **1389.59 and 1391.135** are flat-bottomed **boxes with vertical edges** in QLP SAP *and* KSPSAP. Each starts and ends at flagged cadences. They are absent from three independent pixel-level reductions and from the difference images (0.04 +/- 0.57 and -0.55 +/- 0.35 ppt). This is a QLP-specific photometry glitch, not an eclipse.
* **1394.01 (the "309 ppt eclipse").** QLP SAP_BKG swings from -1e5 to +1.2e5 and then to -4.6e5 across 1393.6-1396.5. QLP SAP rises to 7x nominal at the same time, and the target centroid moves by 6" (`figs/qlp_s3_zoom.png`, `figs/own_phot_s3.png`). This is a strong scattered-light episode just before the orbit-13 end (1395.48) and the perigee ACS tests, and QLP's background estimate fails during it. eleanor-lite shows 4.4 +/- 5.5 ppt there.
* **Other stars (QLP S3, 18 stars within 1.4 deg, `figs/s3_qlp_neighbors.png`, `data/step3_neighbors.json`).** None shows a dip at 1385.094 (all within +/-2.2 ppt, <=1 sigma), at 1389.59 or at 1391.135. Faint stars show noisy features at 1394.0 (e.g. TIC 177079081: 18.9 +/- 7.2 ppt), consistent with the scattered-light episode. The target-only box shapes at 1389.6 and 1391.1 point to QLP's handling of this particular aperture.

## 3. Is there an EB anywhere? (all TESS data, S1-S98)

* **Box scan:** I ran a box search (2-8 h) on every light curve, q = 0 cadences, after a 1-day running-median detrend (`step4_scan.py`, `figs/all_sectors_detrended.png`, `data/step4_scan.json`).
  * The only dips deeper than 7.5 ppt are the QLP S3 artifacts above.
  * Every other flagged dip is 3-7.5 ppt, appears in QLP only, and sits at a sector or orbit start or end: S10 1570.78, S66 3124.04, S93 3830.59, and others.
  * None is in SPOC PDCSAP. The robust per-point scatter of PDCSAP is 0.9 ppt (S1-13) and 1.6-1.7 ppt (S27-39).
* **No primary or secondary eclipse exists in ~43 sectors.** So there is no EB period, eccentricity or depth to give. A real 300 ppt eclipse is impossible to miss over this coverage for any P shorter than many hundreds of days.
* **Catalogues:**
  * Gaia DR3 vari_eclipsing_binary, nss_two_body_orbit, nss_acceleration_astro, nss_non_linear_spectro and nss_vim_fl: none for the 20 nearest sources.
  * vari_summary: one entry, for Gaia 5281640752702888064 (32", G = 20.56, dG = 7.5, so <=1 ppt possible).
  * VSX, TESS EB catalogue (Prsa+2022, J/ApJS/258/16) and Gaia DR3 vari EB in VizieR: 0 within 2'.
  * SIMBAD lists the target only as UCAC4 114-013761 (PM*), plus galaxies.
* **The one genuine hint of binarity is Gaia DR3 RVs, not photometry.** Over 36 transits Gaia gives RV = 68.1 +/- 1.1 km/s, rv_chisq_pvalue = 1.7e-6, renormalised GoF = 5.5 and rv_amplitude_robust = 27.2 km/s, with RUWE 0.96 and no NSS solution.
  * This suggests a **possible non-eclipsing spectroscopic binary**. It is not confirmed, because amplitude_robust is a max-min statistic.
  * It is unrelated to the TESS dips, and it is **not a new EB**.

## 4. Difference images (`figs/diffimage_1385.094.png`, `_1389.59`, `_1391.135`)

| Epoch | Depth in r = 2.5 px | Image SNR | Centroid offset |
|---|---|---|---|
| 1385.094 | 3.5 +/- 1.7 ppt | 2.0 | 2 +/- 29", unconstrained |
| 1389.59 | 0.04 +/- 0.57 ppt | 0.1 | no signal |
| 1391.135 | -0.55 +/- 0.35 ppt | -1.6 | no signal |

No pixel-level flux loss can be attributed to any star at any epoch.

## What would change the verdict

The dip would have to repeat in science-quality data. The star has 43 TESS sectors, and the pipeline found no repeat. A future 8 ppt event in SAP or pixel photometry, away from gaps, would reopen it.

## Notes for our pipeline

* The **sector label** in the find record is wrong: it says S1, but the event is in S3.
* **S3 ACS-test cadences** (BTJD < 1385.8966, and after 1406.29) should be masked, as SPOC does.
* The QLP S3 light curve of this star contains **large background failures**, and the "309 ppt eclipse" came from one of them. A secondary-eclipse check should require the deeper event to pass the same quality and pipeline checks before it is used as a rejection reason.
* The **multiplicity, neighbours and FPP checks** treat the target's own Gaia source as a 2" neighbour, because proper motion is not propagated to the TIC epoch.

## Files

* Scripts: `step1_*` (TIC, products, downloads, TESScut), `step2_*` (own photometry, 1385 zoom, other pipelines), `step3_*` (other stars), `step4_diffimage.py`, `step4_scan.py`, `step5_*` (catalogues), `step6_summary_plot.py`. Shared modules: `measure.py`, `lcio.py`.
* Data: `data/` (JSON results, Gaia/TIC tables, FITS).
* Figures: `figs/`.
