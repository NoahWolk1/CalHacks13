# TIC 299940140 — follow-up of a single-transit find (BTJD 1426.302)

Analysis run 2026-11-01 on public data only: MAST light curves (SPOC, QLP, and the ELEANOR-lite, TGLC and TASOC community light curves), TESScut, Gaia DR3, SIMBAD and VizieR (CfA mirrors), the AAVSO VSX API, and ExoFOP read-only pages. Nothing was submitted anywhere.

## Verdict: **systematic artifact**

The "transit" is not light from any star. It is an offset across the whole CCD column that holds the target. In the Sector 4 calibrated FFIs that column sits right next to a broken column.

* **Where the event is.** BTJD 1426.302 = 2018-11-08 19:15 UTC is in **Sector 4** (camera 4, CCD 4), not Sector 2. It falls 2.9 d after the S4 instrument-anomaly gap (1418.47–1421.24).
* **The detector defect.** In the S4 TESScut images, the column immediately left of the target's column has a median of **−1.08×10⁵ e⁻/s**. Its neighbours are also abnormal: the target column reads ~255 e⁻/s in empty rows against ~90 for the sky, and the column on the other side reads ~50. This is absent in S3 and S5, where the star lands on other columns.
* **The pixels.** At the deepest frame (1426.281), every pixel of the target column loses the same amount: **−29.8 e⁻/s median over 151 rows (5–95%: −32.7 to −25.0)**. The next column, which holds about half the star's light, changes by +1.1 e⁻/s.
* **SPOC SAP.** Its aperture is 3 rows × the target column and its right-hand neighbour. SAP deviations track 3 × (column offset) with **r = 0.957, slope 1.03**. Removing the offset takes the depth from **13.1 ± 5.8 to 0.71 ± 0.59 ppt**.
* **Other stars.** Five other stars on the same column, 22–68 px away, show **10.6–31.9 ppt** at the same time. After column correction all are zero (−0.39 to +0.41, ±0.4–0.5 ppt).
* **Independent pipelines.**
  * No dip: QLP −0.6 ± 1.2 ppt, ELEANOR-lite +0.25 ppt, TGLC PSF fit −7.0 ± 3.7 ppt.
  * Dip present: TGLC aperture +16.9 ppt and TASOC +25 ppt, both of which include the bad columns.
* **No repeat.** There is no other event in 42 sectors (S1–S98). The per-sector 3σ limit for a 3 h dip is 0.7–1.6 ppt, except in S4 SPOC, where every >5σ dip is the column artifact. That includes the automated vet's "repeats" at 1414.94, 1417.44 and 1428.31.

## Status of each step

| # | Step | Status |
|---|---|---|
| 1 | Host parameters (TIC + Gaia DR3), products, downloads | verified |
| 2 | Depth in every reduction, incl. SAP, own TESScut photometry and column-corrected photometry | verified: the dip exists only in apertures that include the bad column(s) |
| 2b | PDC check | verified: SAP 13.1, PDCSAP 12.8 ppt; the cause is upstream, in the pixels |
| 3 | Flags, momentum dumps, gaps, scattered light, other stars | verified: column defect found; same-time dips on 5 stars on the same column |
| 4 | Difference image + Gaia neighbours | verified: the flux loss is a 1-px-wide column, not a PSF |
| 5 | All sectors: repeats, secondary, odd/even, allowed periods | run: no other event; no odd/even (single event); the period list is moot |
| 6 | batman fit, implied density | run (face value): unphysical |
| 7 | ExoFOP/TOI/CTOI/VSX/SIMBAD | run: nothing known; CDS unreachable, CfA mirrors used |

## 1. Host star

| Quantity | Value |
|---|---|
| TIC 8.2 | Teff 6037 ± 123 K, logg 4.19 ± 0.08, R★ 1.40 ± 0.07 R☉, M★ 1.12 ± 0.14 M☉, ρ★ 0.405 ± 0.089 ρ☉, d 489 ± 5 pc, Tmag 12.00, contamination ratio 0.020 |
| Gaia DR3 5268603224855916288 | G 12.40, parallax 2.024 ± 0.010 mas, Teff (photometric) 5992 K, Teff (spectroscopic) 5839 K, logg 4.09, R★ 1.36 (photometric) / 1.35 (FLAME) R☉, M★ 1.13 (FLAME) M☉, age 5.0 Gyr, [M/H] −0.66 |
| Gaia binarity indicators | RUWE 1.065, ipd_frac_multi_peak 0, ipd_gof_harmonic_amplitude 0.005, non_single_star 0; no orbit, acceleration, variability or eclipsing-binary entries |
| Gaia radial velocity | 35.46 ± 1.29 km/s from 17 transits, rv_chisq_pvalue 0.52 (constant) |
| SIMBAD radial velocity | 35.86 ± 0.12 km/s (2021MNRAS.506..150B) |
| Ecliptic latitude | −83.5°, near the southern continuous viewing zone |

## 2. Depths in S4

Fit: 3 h trapezoid at the fixed epoch with a quadratic baseline per data segment, using `measure.py` from the TIC 150319068 follow-up. "frac_deeper" is the fraction of the same fit slid across the sector that comes out at least as deep.

| Product | Depth [ppt] | σ | frac_deeper |
|---|---|---|---|
| SPOC SAP (q = 0) | 13.1 | 5.8 | 0.021 |
| SPOC PDCSAP | 12.8 | 5.4 | 0.021 |
| SPOC SAP minus 3 × column offset | **0.71** | 0.59 | — |
| QLP SAP / KSPSAP (all finite; good-quality cadences cover only 33% of the event) | −0.64 / −0.62 | 1.25 / 1.22 | 0.58 |
| ELEANOR-lite raw / corrected | 0.29 / 0.25 | 0.15 / 0.08 | — |
| TGLC PSF / calibrated PSF | −7.0 / −6.6 | 3.7 / 3.8 | 0.92 |
| TGLC aperture / calibrated aperture | 16.9 / 16.2 | 6.8 | 0.04 |
| TASOC raw / corrected | 25.2 / 25.1–25.4 | 12.7 | 0.06–0.09 |
| Own TESScut r = 1.5 / 2.5 px (bad column masked, target column kept) | 14.3 / 19.2 | 5.7 / 7.7 | 0.02–0.03 |
| Own TESScut, columns +1/+2 only (target column excluded) | −0.76 | 2.98 | 0.75 |
| Own TESScut, column-corrected r = 1.5 px | **0.19** | 0.35 | 0.29 |

* **Event structure.** The "3 h" event is really separate 30-min frames: 1426.260 (−22 ppt), 1426.281 (−34 ppt), 1426.302 (−6 ppt) and 1426.323 (−20 ppt, which SPOC flagged as an impulsive outlier, q = 512).
* **Centroid.** The SPOC column centroid shifts by +0.01–0.016 px on exactly those frames, which is where the vet's 20σ centroid flag comes from.

## 3. Systematics

| Item | Finding |
|---|---|
| Sector timeline | S4 spans 1410.93–1436.82. The anomaly gap is 1418.47–1421.24 and the downlink gap 1423.49–1424.57. The broken column is still drifting during the event (by ~400 e⁻/s between 1424.6 and 1426.5). |
| Momentum dumps | 1422.94 and 1427.58; neither coincides with the event. |
| Scattered light | The QLP Straylight2 flag covers 1425.30–1426.30. The SPOC background is flat (274.5 vs 275.2 e⁻/s). |
| SAP vs column offset | 44 SAP frames fall below −1% after 1424.5, and 43 of them have a target-column offset below −5 e⁻/s. |
| Vet's "repeats" | Column offsets of −71.6, −27.0 and −37.1 e⁻/s at 1414.94, 1417.44 and 1428.31. |
| Stars on the same column | Raw 10.6 / 28.0 / 12.4 / 31.9 / 27.0 ppt; column-corrected −0.39 / 0.41 / −0.08 / −0.26 / 0.27 (±0.4–0.5) ppt. |

## 4. Difference image and neighbours

* **Difference image.** The 1426.281 frame minus a 1426.40–1426.90 reference shows a single −30 e⁻/s stripe down the target column. There is no PSF-shaped deficit anywhere, only small jitter dipoles on bright stars. The automated vet's own difference image shows the same one-column stripe (~+16 e⁻/s out minus in).
* **Gaia DR3 within 3′: 130 sources.** Eclipse depths are what a neighbour would need to produce 14.1 ppt on the target:

  | Sep | G | Needed eclipse | Notes |
  |---|---|---|---|
  | 11″ | 19.2 | impossible | |
  | 21″ | 18.2 | impossible | |
  | 32″ | 17.2 | impossible | |
  | 74″ | 15.4 | 23% | |
  | 90″ | 12.2 | 2.6% | different column, no dip |
  | 138″ | 13.5 | 5.4% | |
  | 154″ | 12.4 | 2.8% | |

## 5. All sectors

* **Coverage.** MAST has SPOC light curves for S1–13, 28–36, 38 and 39, and QLP for S1, 2, 4–13, 28–36, 38, 39, 61–69, 88–90 and 93–98: 42 sectors spanning BTJD 1325–4046.
* **Box scan.** Outside S4 SPOC, the 3σ limit is 0.7–1.6 ppt and the largest 3 h dip is ≤4.5 ppt. The few QLP-only dips (S29 2113.40, 4.5 ppt; S62 3013.85, 4.1; S89 3718.23, 3.2; S39 2380.94, a single-frame outlier) are absent from SAP/SPOC (≤1.5 ppt).
* **Secondary eclipse.** Anything deeper than ~1–1.5 ppt is excluded at every covered phase.
* **Allowed periods, if the event were real.** Every P < 262.5 d is excluded. Below 400 d only narrow windows survive: 262.5, 280.9, 294.6–300.5, 302.0–302.1, 306.9–307.0, 336.9–337.1, 344.3, 350.8–351.0, 358.1–358.7, 365.0–366.3, 372.3–373.2 and 393.8 d. About 8% of 100–1000 d and 71% of 1000–3000 d is allowed.

## 6. Face-value transit fit

* **The fit.** batman, circular orbit, fitted to SPOC SAP within ±1 d. It locks onto the 2–3 deep frames: depth 48–58 ppt, b 0.85–0.89 (V-shaped/grazing), ρ★ 72 ρ☉ at P = 30 d and 713 ρ☉ at 300 d (1760× catalog), residual rms 9.9 ppt.
* **Compared with the star.** A central transit of this star would last ~16 h at P = 300 d.
* **Conclusion.** The shape is neither a planet transit nor a stellar eclipse.

## 7. Prior knowledge

* **ExoFOP:** no TOIs, CTOIs or planet parameters. Not in the TOI list (8152 lines) or the CTOI list (5140 lines).
* **AAVSO VSX** (3′) and **VizieR** VSX and TESS eclipsing-binary catalogs (2′): no rows.
* **SIMBAD:** UCAC4 108-015026, type `*`, nothing flagged.
* **CDS Strasbourg** was unreachable.

## Not checked

* T16 and TARS Sector 3 light curves failed to read (corrupt download). They don't cover S4.
* No ground-based data checked.

## Pipeline note

Reject a dip when the aperture borders a column with an extreme median value and that column's frame-by-frame offset tracks the dip.

## Files

Scripts `step1_*` to `step6_*` plus `lcio.py` and `measure.py`; run with `../.venv/bin/python -W ignore` from this folder.

* **Figures (`figs/`):** `raw_window_s4.png`, `s4_column_artifact.png`, `s4_diff_frame.png`, `s4_column_stars.png`, `all_sectors.png`, `fit_spoc_sap.png`.
* **Data (`data/`):** `tic.json`, `gaia_3arcmin.csv`, `step2_archival.json`, `step2_column.json`, `step3_column_stars.json`, `step5_allsectors.json`, `step6_fit.json`, `step1_catalogs*.txt`, plus the downloaded FITS files.
