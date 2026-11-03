# TIC 166972732: follow-up of the single-transit find (BTJD 1449.052, 12.9 ppt, 4 h)

Analysis run 2026-11-02. It uses public data only: MAST (QLP light curves for 44 sectors, S1–S98; the year-1 HLSPs GSFC-ELEANOR-lite (12 sectors), TASOC (6), TGLC (10) and TARS (S1–13, plus S87 and S89); TESScut for S5; QLP S5 light curves of 25 other stars within 30′), Gaia DR3 (ESA archive), TIC 8.2, SIMBAD (CfA TAP mirror), the AAVSO VSX API, and ExoFOP (target JSON, TOI and CTOI lists, read only). Nothing was submitted anywhere. No SPOC or TESS-SPOC products exist. The T16 files downloaded but were not used for this star.

## Verdict: **noise / systematic artifact.** The dip exists only in QLP. It coincides with a spike in QLP's own background estimate, it grows with QLP's aperture size, and it is absent from every other reduction and from the pixels.

* **Every reduction other than QLP is flat at 1449.052.** Each row is a 4 h box with a quadratic baseline over ±0.6 d (σ_white·β):

| Product (S5) | Depth [ppt] |
|---|---|
| QLP SAP / KSPSAP | **17.9 ± 3.8 / 15.8 ± 3.7** |
| QLP KSPSAP_SML / KSPSAP_LAG (small / large aperture) | **7.6 ± 2.0 / 25.8 ± 5.3** |
| TARS | 0.5 ± 1.0 |
| GSFC-ELEANOR-lite RAW / CORR / PCA | 1.6 ± 1.8 / 3.0 ± 2.1 / 3.4 ± 2.0 |
| TGLC aperture / cal_aper | 1.9 ± 1.8 / 1.9 ± 1.9 |
| Own TESScut, column-wise background, r = 1 / 1.5 / 2 / 2.5 / 3 / 4 px (slid-box σ) | 1.8 ± 1.1 / 0.9 ± 1.0 / 1.9 ± 0.75 / 2.6 ± 0.8 / 2.3 ± 0.8 / 2.3 ± 0.85 |

* **QLP's background estimate doubles during the dip.** QLP SAP_BKG is 2195 e⁻/s in the 4 h box, against 1049 ± 594 e⁻/s over the rest of ±1 d. It peaks at 2552 e⁻/s in the 2 h bin centred on the event. Over-subtracting that excess makes the dip.
  * The SPOC-calibrated cutout's residual background is flat at 0.19–0.25 e⁻/s/px over ±1 d.
  * QLP's centroids (SAP_X/Y) are smooth through the event.
* **The QLP depth grows with aperture size: 7.6 → 15.8 → 25.8 ppt (SML → default → LAG).** This is the vet's "large/small ratio 4". A dip on the target would be deepest in the smallest aperture. An additive background error instead grows with the number of pixels.
* **The pixels carry no deficit, on the target or on any neighbour.**
  * The per-pixel box-depth map (column-wise background, σ from boxes slid over orbit 1) has |SNR| ≤ 3.45 everywhere. The maximum is 3.9 px from the target, and the target's own pixels are ≤ 2σ.
  * The bright neighbour Gaia DR3 5279571854081252224 (G 13.07, 51.5″, about 2.4× the target's flux) would need only a 2.5% eclipse to make the dip. Its own r = 1 px light curve gives 0.89 ± 0.67 ppt.
  * The other bright stars in the cutout are flat too: G 12.32 at 110″ (0.24 ± 0.54), G 12.13 at 116″ (0.49 ± 0.37), G 15.02 at 115″ (0.86 ± 0.77), G 15.45 at 95″ (1.9 ± 1.2), and the LMC carbon star G 15.88 at 49″ (−0.11 ± 2.28).
* **It is not common to the CCD.** Across 25 QLP S5 stars within 30′, the median 4 h depth at 1449.052 is +0.1 ppt (KSPSAP) and +0.3 ppt (SAP), with none beyond ±3σ. The background error is local to this target's QLP aperture.
* **QLP makes events of this size in both directions throughout.** A 4 h box scan of all 44 QLP sectors finds 10 dips and 11 brightenings above 4σ, 5 and 5 above 5σ, and 1 and 2 above 6σ (counting the top 12 of each sign). The 1449.05 event (4.3σ in this scan) does not rank among the top 12 dips.
* **The vet's other flags are QLP artifacts too.**
  * "Secondary" at 3665.55 (S87): QLP 4.9 ± 2.4 ppt, TARS 1.3 ± 1.5.
  * "Brightening" at 3733.28 (S89): QLP DET −20.2 ± 3.3 and SYS_RM −29.5 ± 4.9, but QLP SAP −2.4 ± 2.2 and TARS −4.0 ± 1.6. It is made by QLP's detrending.
  * "Pipelines disagree" (QLP 14.1 vs ELEANOR 3.0 ppt) is confirmed: the disagreement is real, and QLP is the outlier.
* **The host is a single-looking K0/G9 dwarf.** Gaia DR3: ϖ 2.233 ± 0.014 mas, M_G 5.78, BP−RP 1.03, RUWE 1.06, no NSS entry. It is a Gaia "SOLAR_LIKE" variable (VSX type ROT, G 14.01–14.04). The VSX entry the vet flagged ("already catalogued") is this rotation classification, not an eclipsing binary.

**Confidence.** High (> 95%) that there is no transit-like event on this star or on any resolved neighbour at 1449.052.
* A real 13–16 ppt dip of the target would appear at ≥ 8σ in TARS, at ≥ 6σ in ELEANOR and TGLC, and at ≥ 10σ in our r = 2 px photometry.
* All of them are at or below ~2.6 ppt. The QLP depth tracks QLP's own background spike.

## Status of each step

| # | Step | Status |
|---|---|---|
| 1 | Host: TIC 8.2, Gaia DR3 (astrometry, GSP-Phot, FLAME, RV, RUWE/IPD), NSS and variability tables for the target and all 33 neighbours with G < G★+6 within 1′, LMC check | **verified**: foreground K0/G9 dwarf at 448 pc; rotation variable; no binarity indicator; no NSS entry for any of the 34 sources |
| 2 | Depth in every reduction (QLP SAP/KSPSAP/SML/LAG, TARS, ELEANOR RAW/CORR/PCA, TGLC, own TESScut at 6 apertures × 3 backgrounds) | **verified**: QLP only (15.8 ppt); everything else ≤ 3.4 ppt, mostly consistent with zero |
| 3 | Systematics: quality flags, background (QLP vs cutout), centroids, orbit edge, 25 same-field QLP stars | **verified**: QLP background doubles in the box; not common-mode; event is ~1.3 d before the orbit-1 end, before the end-of-orbit scattered light |
| 4 | Location: per-pixel deficit map, Gaia neighbours (needed eclipse depth and own photometry of each bright one) | **verified**: no deficit on any pixel or star; the G 13.07 neighbour that could need just a 2.5% eclipse is flat (0.9 ± 0.7 ppt) |
| 5 | All sectors: 4 h scan for dips and brightenings in 44 QLP sectors; vet's 3665.55 and 3733.28 in QLP and TARS; rotation | **run**: equal rates of dips and brightenings; both vet events are QLP-only; no repeat is meaningful because there is no primary event |
| 6 | Shape: batman fit of the QLP dip (P fixed at 198 d) | **run**: degenerate (a/R★ at the 500 bound, T14 3.3 h, k 0.13). Meaningless for an artifact |
| 7 | ExoFOP / TOI / CTOI / VSX / SIMBAD | **run**: nothing known except the Gaia ROT classification. VizieR down on both mirrors |

---

## 1. Host star (`data/step1_products.txt`, `data/step1_gaia.txt`, `data/step1_gaia.json`)

| Quantity | Value |
|---|---|
| TIC 8.2 | Tmag 13.499, V 14.21, Teff 5331 ± 122 K, logg 4.64, R 0.760 R☉, M 0.92 M☉, ρ 2.10 ρ☉, d 440 pc, lumclass DWARF; 2MASS J06190008-6920545; no contamination ratio |
| Gaia DR3 5279568899143754752 | 0.13″ from the TIC position, G 14.03, BP−RP 1.033, ϖ 2.233 ± 0.014 mas (d 448 pc), μ (−7.67, +3.13) mas/yr |
| Binarity indicators | RUWE 1.06, ipd_frac_multi_peak 0, ipd_gof_harmonic 0.012, astrometric excess noise 0.011 mas (sig 0.06), non_single_star 0, DSC binary probability 0.0002 |
| Gaia RV | +4.0 ± 3.9 km/s (23 transits). No rv_chisq_pvalue or amplitude is published at this G_RVS |
| GSP-Phot / FLAME | Teff 5221 K, logg 4.56, R 0.770 (GSP-Phot) / 0.779 R☉ (FLAME), M 0.889 M☉, L 0.41 L☉, ESP-HS type G |
| CMD | M_G 5.78 at BP−RP 1.03: on the main sequence |
| Gaia variability | phot_variable_flag VARIABLE; vari_classifier SOLAR_LIKE (score 0.42); G range 14.013–14.043 over 38 FoV transits, σ 7.1 mmag; no vari_rotation_modulation entry |
| LMC? | No (165σ parallax, Galactic proper motion and RV) |
| NSS / vari_eclipsing_binary | No entry for the target or for any of the 33 neighbours with G < 20.0 within 1′ |

**Bright sources near the aperture:**
* Gaia 5279571854081252224, G 13.07, 51.5″, ϖ 1.52.
* Gaia 5279568864784086400, G 15.88, 49.2″: SIMBAD [KDM2001] 7550, an LMC carbon star (C*), RV +257 km/s; VSX type "L", G 15.69–16.10.
* Gaia 5279568864784017280, G 16.93, 37″.
* 30 fainter stars (G 17.9–20.0) within 1′.

## 2. Depths (`data/step2_look.json`, `data/step2_own_phot.json`, `data/step4_pixels.json`, `data/step5_search.json` ["events"], `figs/step2_zoom.png`, `figs/step2_own_phot.png`)

**Methods.**
* Archival products: a 4 h trapezoid plus quadratic baseline, window ±0.6 d, values more than 30% from the median rejected, error σ_white·β (`step5_search.py`).
* `step2_look.py` gives the same picture with ±1 d windows and slid empirical errors: QLP KSPSAP 15.0 ± 3.4, TARS 0.4 ± 1.1, TGLC 1.7 ± 1.7, ELEANOR 1.7–2.7 ± 2–3 ppt.
* Own photometry: column-wise background (faintest 40% of each column), a ±0.6 d local fit, and σ from 4 h boxes slid over orbit 1 (`step4_pixels.py`).
* The global and annulus backgrounds in `step2_own_phot.py` are dominated by orbit-scale ramps over ±1 d (σ 20–30 ppt), so the column-wise numbers are adopted. With the ±1 d fit, the column-wise r = 1 / 1.5 / 2.5 / 3.5 px depths are 1.5 ± 1.4 / 1.0 ± 1.0 / 2.1 ± 1.0 / 1.8 ± 0.9 ppt.

The table in the verdict gives the results. The S5 cutout is SPOC-calibrated, with a residual background of ~0.2 e⁻/s/px. The light curve is smooth through the event to within ~1 ppt per cadence (`figs/step2_own_phot.png`).

**The ~2 ppt in our own photometry (2–3σ at r = 2–4 px)** is not significant, given the 2.4σ–3.5σ extremes of the slid boxes. It is in any case 6× smaller than QLP's depth. It does not correspond to a 13 ppt event on the target, which would be 1–2 ppt *at most* after dilution only if the source were a faint neighbour, and §4 rules those out pixel by pixel.

## 3. Systematics (`figs/step2_zoom.png`, `data/step3_neighbors_s5.json`)

* **QLP background in 2 h bins around the event:** 1424, 1449, 1101, 1313, 1295, 1718, **2552**, 1310, 1333, 1094 e⁻/s (−12 h to +10 h). The spike lasts ~4 h and matches the dip's duration and centre. QLP SAP flux in the same bins goes 1.048 → 1.037 → **1.022** → 1.046.
* **Flags.** No flagged cadences in the box. The scattered light at the end of orbit 1 starts ~22 h later (QLP background > 25,000 e⁻/s; ELEANOR and TGLC backgrounds rise too).
* **Centroids.** QLP SAP_X/Y drift smoothly by < 0.003 px through the event. The vet found no jitter (1.6×).
* **Same field.** 25 QLP S5 stars within 30′ give a median of +0.1 ppt (KSPSAP), with 0 of 25 > 3σ deep or bright.

## 4. Location (`data/step4_pixels.json`, `figs/step4_pixels.png`)

* **Per-pixel deficit map.** The 4 h box deficit of every pixel in the 21 × 21 cutout, divided by its slid-box σ, ranges from −2.4 to +3.45. The maximum, at pixel (8,7), is 3.9 px (82″) from the target, has no matching structure around it, and lies within the expected extremes for 441 pixels. The target's 3 × 3 core pixels are at +0.0 to +0.6 e⁻/s against σ 0.14–0.33 (≤ 2σ).
* **Own photometry of each bright Gaia star** (r = 1 px), with the eclipse each would need to produce 15 ppt in a blend dominated by the target:

| Source | Sep | G | Needed eclipse | Own depth [ppt] |
|---|---|---|---|---|
| target 5279568899143754752 | 0″ | 14.03 | 6.2% (of its own light, in the blend) | 1.8 ± 1.1 |
| 5279568864784086400 (LMC C star) | 49″ | 15.88 | 34% | −0.1 ± 2.3 |
| 5279571854081252224 | 51.5″ | 13.07 | 2.5% | 0.9 ± 0.7 |
| 5279572025879942016 | 95″ | 15.45 | 23% | 1.9 ± 1.2 |
| 5279592122020962432 | 110″ | 12.32 | 1.3% | 0.2 ± 0.5 |
| 5279572128959156352 | 116″ | 12.13 | 1.1% | 0.5 ± 0.4 |

* **Fainter neighbours.** The 1′ stars with G 16.9–19 would need eclipses of 89% to > 100%; for example Gaia 5279568929199025408 at 12.5″, G 18.62, needs 4.2× its own flux (impossible). None can make 15 ppt, and the pixels near them show no deficit.

## 5. All sectors (`data/step5_search.json`)

* **4 h box scan of all 44 QLP sectors** (KSPSAP or DET, step 0.05 d, ≥ 80% coverage).
  * Deepest dips: 14.1 ppt (7.4σ) at S61 2976.90; 12.7 (5.8σ) at S89 3733.48; 11.6 (5.3σ) at S29 2097.99; 4.5 (5.3σ) at S94 3857.71; 10.5 (5.1σ) at S27 2045.53.
  * Strongest brightenings, excluding S4's catastrophic −1000 ppt cadences: −20.0 (5.6σ) at S89 3733.28; −12.9 (5.5σ) at S29 2111.94; −18.0 (5.1σ) at S28 2084.70.
  * Counts in the top 12 of each sign: > 4σ, 10 dips / 11 brightenings; > 5σ, 5 / 5; > 6σ, 1 / 2.
  * Equal rates mean these are QLP noise and systematics. The S89 3733.48 dip sits next to the vet's 3733.28 brightening: a QLP detrending wiggle.
* **Vet events** (QLP columns and TARS, same box):
  * 3665.55: QLP SAP 4.9 ± 2.4, DET 4.8 ± 2.4; TARS 1.3 ± 1.5.
  * 3733.28: QLP SAP −2.4 ± 2.2, DET −20.2 ± 3.3, SYS_RM −29.5 ± 4.9; TARS −4.0 ± 1.6.
* **Rotation.** QLP SAP Lomb–Scargle peaks fall at 11–14 d in most sectors, often at the 14 d search limit, so sector-length QLP trends dominate them. The vet found 11.8 d (9 ppt) in 1 of 8 sectors. Gaia classifies the star as a solar-like (rotational) variable with σ_G 7 mmag. The rotation period is not reliably measured here. Rotation cannot make a 4 h, 15 ppt dip, and the dip is not in the star's light anyway.
* **Repeats, odd/even, period constraints.** Moot: no primary event exists to repeat.

## 6. Shape (`data/step6_fit_s5.json`)

A face-value batman fit to QLP KSPSAP (P fixed at the vet's most probable 198 d, circular, quadratic LD 0.42/0.20) gives:
* k = 0.129, b = 0.28, T14 3.3 h;
* a/R★ pinned at the 500 upper bound, i.e. ρ ≥ 43 ρ☉ against the star's 2.1 ρ☉.

At 198 d a central transit of this star would last 8.3 h. The 3.3 h width would need P ≈ 18–20 d (which the TESS coverage would have shown again) or a high impact parameter. The fit is uninformative because the event is not in the star's light.

## 7. Catalogs (`data/step7_catalogs.json`, `data/step7_catalogs2.json`)

* **ExoFOP.** No TOIs, CTOIs, imaging, spectroscopy, time series or companions. Not in the TOI list (8152 lines) or the CTOI list (5140 lines). The first CTOI download failed and the retry succeeded.
* **AAVSO VSX API, 90″.**
  * The target is Gaia DR3 5279568899143754752, **type ROT**, G 14.01–14.04, spectral type G, discovered by the Gaia collaboration.
  * Also listed: the 49″ carbon star (type L, G 15.69–16.10, K) and a G 19.5 DSCT/GDOR/SXPHE star at 67″.
  * No eclipsing-binary entry.
* **SIMBAD (CfA TAP), 72″.** The target is not in SIMBAD. The only entry is [KDM2001] 7550 (C*, RV 256.6 km/s) at 49″.
* **VizieR.** CfA returned 502 and CDS timed out, so the VizieR copy of VSX and the TESS EB catalog were not queried.

## What would change the verdict

* An independent reduction of the S5 pixels (for example a PSF fit, or a different background model) showing a ≥ 10 ppt, 4 h dip on the target at 1449.05. None of the four tried (TARS, ELEANOR, TGLC, our own) shows more than 3.4 ppt.
* A repeat of a ≥ 10 ppt, 4 h dip in raw pixel photometry in another sector. QLP's other ~5σ dips are matched by equal numbers of brightenings.

## Not checked

* A PSF-fit (rather than aperture) light curve of the G 13.07 neighbour. Its r = 1 px light curve contains some target light, so its small 0.9 ± 0.7 ppt is a combined limit.
* The QLP background algorithm itself: the spike is seen in QLP's SAP_BKG column, and its cause was not traced.
* A reliable rotation period (would need a systematics-robust reduction such as TARS or ELEANOR over many sectors).
* ASAS-SN, ATLAS and ZTF (moot without a real event).
* VizieR catalogs (servers down).

## Pipeline notes

1. **Require one non-QLP reduction to show a single event before it is reported.** TARS, ELEANOR-lite and TGLC all cover S1–13 and are cheap to fetch. Here all three were flat.
2. **Use QLP's own SAP_BKG as a veto.** Reject events where the background in the box exceeds the local median by more than ~2σ (here 2195 vs 1049 ± 594 e⁻/s).
3. **The aperture-ratio check is informative in the opposite direction to the vet's caveat.** Depth increasing SML < default < LAG is the signature of an additive background error. It should be a flag or veto, not "not scored".
4. **The vet's "already catalogued" flag fired on a Gaia ROT classification.** It should separate rotation and variability types from EB or planet entries.
5. **Single-event significance should be compared with the brightening rate in the same pipeline.** Here QLP makes 5σ events of either sign about equally often.

## Files

Scripts: `step1_products.py`, `step1_download.py`, `step1_gaia.py`, `step1_tesscut.py`, `step2_look.py`, `step2_own_phot.py` (run as `step2_own_phot.py 5:1449.052`), `step3_neighbors.py` (run as `step3_neighbors.py 5 1449.052`), `step4_pixels.py`, `step5_search.py`, `step6_fit.py` (run as `step6_fit.py 5 1449.052 198 2.10`), `step7_catalogs.py`, `step7_catalogs2.py`, plus `hlsp.py` (loader for QLP and every HLSP), `measure.py`, `lcio.py` and `common.py`. Run them with `../.venv/bin/python -W ignore` from this folder. The QLP background bins in §3 came from an inline run on the QLP S5 file; there is no separate script for them.

Data: `data/step1_products.txt`, `data/step1_gaia.{txt,json}`, `data/gaia_2arcmin.csv`, `data/step2_look.json`, `data/step2_own_phot.json`, `data/step3_neighbors_s5.{txt,json}`, `data/step4_pixels.json`, `data/step5_search.json`, `data/step6_fit_s5.json`, `data/step7_catalogs*.{txt,json}`.

Figures (`figs/`): `step2_zoom.png`, `step2_own_phot.png`, `step4_pixels.png`.
