# TIC 149155022: follow-up of the single-transit find at BTJD 3712.786 (QLP S88)

Analysis run 2026-11-02 on public data only: MAST light curves (QLP for 40 sectors, S1–S98; no SPOC or TESS-SPOC product exists for this star), TESScut for S88, QLP light curves of 25 other stars on the same CCD in S88, Gaia DR3 (including the NSS and variability tables), the TIC 8.2, SIMBAD (CfA mirror), the AAVSO VSX API, and read-only ExoFOP pages and TOI/CTOI lists. Nothing was submitted anywhere.

## Verdict: **stellar variability.** The "transit" is the falling flank of one of the star's own ~2-day brightenings, as it comes out of QLP's detrending.

**The star varies by 3–15% in every sector.** The automated vet's "no variability above 0.5 ppt" used QLP's detrended flux (`DET_FLUX`), which takes most of it out.
* QLP SAP shows quasi-periodic, peaked brightenings in all 40 sectors (S1–S98) and on all four CCDs of camera 4. The Lomb–Scargle peak is at **1.77–2.2 d** depending on the sector. The 2–98% range is 2.6–9.0%, and single brightenings reach 3–15.5%.
* The brightenings are rounded peaks over a flat floor, and their height and width change from cycle to cycle.
* The variable is the target, not the 13″ neighbour. In S88 the variability has the same fractional amplitude in apertures of r = 1, 1.5 and 2.5 px (7.1, 7.2 and 7.4%). Its per-pixel amplitude image is centred 4.5″ from the median-image photocentre, with about 4″ scatter between the two halves of the sector. That offset points away from the 13″ neighbour (T 16.6). The neighbour has 3% of the target's flux, so it would have to vary by about 230% to produce this.

**The event is a brightening's falling flank.**
* The dip starts 0.24 d after the maximum of a 6.4% brightening (BTJD 3712.543). QLP `DET_FLUX` then dips below the floor there.
* **This happens after every tall brightening.** We aligned all 73 brightenings taller than 3% across 40 sectors. For each, we took the deepest 4 h `DET_FLUX` box 0.05–0.6 d after the maximum. Median: 2.8 ppt. The deepest values are the event (12.8 ppt, +0.22 d), then S64 3059.21 (10.1 ppt, +0.18 d), S88 3697.31 (9.5 ppt, +0.22 d), S88 3695.24 (7.9) and S93 3833.54 (7.9 ppt, +0.17 d). **The vet's "secondary eclipse" at 3833.73 is the S93 case**, and its "brightening at 3697.27" is the 15.5% brightening itself.
* **Modelling the brightening removes the dip.** We built an empirical brightening template (the median of all 73) and fitted it to each brightening, with free height, offset, linear baseline and separate stretches for the rise and the fall.
  * In the residuals, the event's 4 h box is 4.8 ± 0.7 ppt; 1.4% of brightenings are as deep at that offset.
  * At the deepest offset after each brightening (a fair look-elsewhere comparison), **6.8% of brightenings are as deep** as the event.
  * The residual is **mirror-symmetric**. The same box on the *rising* flank (−0.24 d) is 6.2–7.0 ± 0.7 ppt, as deep as the "transit" side. This brightening is simply narrower and more peaked than the template; that leaves matched negative residuals on both flanks and a positive one at the top (`figs/event_template_fit.png`).

**Confidence:** high (~90%) that the find is the star's variability, not a transit. A real ≲5 ppt transit at that time cannot be excluded, since the residuals of the variability model are about that large. But nothing in the data requires one. Planet-sized companions would also be hard to establish on this star: RUWE 6.3 and a 57% Gaia multi-peak fraction point to an unresolved companion.

## Status of each step

| # | Step | Status |
|---|---|---|
| 1 | Host: TIC 8.2, Gaia DR3 (astrometry, RUWE/IPD, NSS, vari, RV, GSP-Phot/FLAME), SIMBAD | **verified**: Galactic F star at ~830 pc (not LMC). RUWE 6.26 and 57% multi-peak: likely a close binary. No NSS solution. SIMBAD BPS CS 31076-0054 (HK survey) |
| 2 | Depth in QLP SAP / `DET_FLUX` and own TESScut (4 apertures); re-measure against a variability model | **verified**: 11–14 ppt raw in every reduction, on the target. **4.8 ± 0.7 ppt once the brightening is modelled, with an equal mirror residual on the rising side** |
| 2b | Variability: all 40 sectors, periodogram, brightening stack, template model | **verified**: quasi-periodic 1.8–2.2 d brightenings of 3–15% in all sectors; the event follows one |
| 3 | Quality flags, momentum dumps, gaps, background, jitter, 25 same-CCD stars | **verified**: S88 is clean at the event (no flags, no dump within 2 d, 1.2 d from the orbit gap, flat background, jitter 0.9×). No common-mode dip on other stars (0 of 25 above 3σ) |
| 4 | Location: per-pixel variability amplitude and dip images, Gaia neighbours | **run**: both the variability and the dip are centred on the target to within ~5″. The 13″ neighbour is ruled out as the variable |
| 5 | All sectors: repeats, secondary, brightenings vs dips | **verified**: every comparable "dip" in the data (incl. the vet's 3833.73 "secondary") sits 0.17–0.22 d after a tall brightening. Brightenings this size are far more common than dips |
| 6 | batman fit and implied density | **run** (face value): 13.7 ppt, T14 6.6 h, grazing (b 0.8). Not meaningful, because the feature is not a separate event |
| 7 | ExoFOP / TOI / CTOI / VSX / SIMBAD / VizieR | **run**: no TOI, CTOI, imaging, spectra or companions. VSX empty. SIMBAD: BPS CS 31076-0054. VizieR unreachable (CfA 502, CDS and IUCAA time out) |

## 1. The star

| | Gaia DR3 4759584699030756608 = TIC 149155022 |
|---|---|
| G / BP−RP / T | 13.18 / 0.503 / 12.90 |
| Parallax | 1.206 ± 0.059 mas (829 pc; TIC 1056 pc) |
| μ | (+1.78, +10.56) mas/yr |
| M_G | 3.59 (3.46 after A_G 0.13) |
| RUWE / AEN / IPD multi-peak / harmonic amp. | **6.26** / 0.67 mas (sig 363) / **57%** / 0.038 |
| non_single_star / NSS tables / vari tables | 0 / none / none (all four checked for every Gaia source within 1′) |
| Gaia RV | 22.3 ± 5.3 km/s (9 transits; no χ² or amplitude statistics published) |
| GSP-Phot | Teff 7091 K, logg 4.18, [M/H] −0.75, R 1.43 R☉; FLAME R 1.15 R☉, L 3.0 L☉, no mass |

* **TIC 8.2** has no Teff, radius or mass, only d = 1056 pc. That is why the vet could not compute a companion radius. On Gaia's radius (1.15–1.43 R☉), a 9–13 ppt dip would be a 12–17 R⊕ body.
* **Not in the LMC.** RA 81.5°, Dec −60.2° is just outside the LMC box. The parallax (20σ) and proper motion are Galactic.
* **SIMBAD:** `2MASS J05254917-6010222` = **BPS CS 31076-0054**, a star from the HK objective-prism survey for metal-poor stars. UBV photometry in Beers et al. 2007 (ApJS 168, 128) gives V 13.166, B−V 0.33, U−B 0.01. This is consistent with a warm, mildly metal-poor F star; GSP-Phot gives [M/H] −0.75.
* **Binarity:** RUWE 6.3, excess noise at 363σ, and 57% of Gaia transits with a double-peaked image all point to a companion at ~0.1–1″ (80–800 au) bright enough to move the photocentre. Gaia DR3 has no orbit for it.
* **Neighbours:** only two Gaia sources within 30″: G 20.6 at 10.5″ and **Gaia DR3 4759584699030633728 (TIC 149155023), G 16.96 / T 16.6 at 12.9″**, a background star (ϖ 0.19 mas). The next is G 15.8 at 62″.

## 2. The event in every reduction

* **Products.** QLP is the only light curve covering S88. There is no TESS-SPOC, eleanor, TGLC or TASOC product for 2025, and the vet's "pipelines" check had nothing to compare.
* **Raw depth (local polynomial baseline, 4 h box):**

| Reduction | Depth |
|---|---|
| QLP `DET_FLUX` | 11.1 ± 1.0 ppt |
| QLP SAP, poly4 ±0.6 d | 13.1 ppt |
| QLP SAP, poly6 ±0.8 d | 13.7 ppt |
| Own TESScut, r = 1 / 1.5 / 2.5 / 3.5 px (poly4 ±0.6 d) | 13.1 / 13.0 / 13.5 / 13.7 ± 1.3 ppt |

  The depth does not change with aperture, so the dip is in the target's pixels. Our own photometry reproduces it, so it is not a QLP artifact either.
* **Depth against the variability model (§2b):** 4.8 ± 0.7 ppt when the template is fitted with no mask, or 7.4 ± 0.7 ppt with the 4 h window masked. The same box on the rising side gives 6.2–7.0 ppt.
* **Why the vet's raw-SAP check failed.** It gave −11.3 ± 15.9 ppt because a low-order baseline cannot follow a 6% peak.
* **Why the detrending check flagged.** It saw 17.2 ppt with a 0.5 d running median versus 11–13 ppt with longer windows. A running median clips the top of a 0.5 d-wide peak and deepens its flanks.

## 2b. The variability (`figs/all_sectors_sap.png`, `figs/peak_stack.png`, `data/step2_*.json`)

* **All 40 QLP sectors.** The per-sector Lomb–Scargle best period is 1.77–2.22 d in 37 sectors; S39 (7.7 d), S65 (11.0 d) and S63 have weaker peaks. The 2–98% SAP range is 2.6–9.0%.
* **The brightenings.**
  * Shape: 73 brightenings taller than 3% share a profile about 0.5 d wide (FWHM), with rise and fall stretches that vary by ±30%.
  * S88 has the tallest ones: 15.5% at 3697.31 and 6.4% at 3712.54 (the event's).
* **Pointing.** QLP centroids do not follow the flux in any consistent way. The per-sector slopes of centroid against flux are 0.02 ± 0.14 px per unit of relative flux across 59 orbits.
* **Nature of the variability: not determined.** Possibilities include beating g-mode (γ Dor-like) pulsation in a 7100 K star, activity or rotation of the companion, or something else. Whatever it is, it is astrophysical: it is present in every camera/CCD combination and year, and it is centred on the star.

## 3. Systematics (`data/step3_flags.json`, `data/step3_neighbors_s88.json`)

* **Flags and dumps.** QLP S88: no flagged cadence within ±1 d. TESScut: no momentum dump within ±2 d.
* **Gaps.** The orbit gap at 3711.40–3711.61 ends 1.2 d before the event.
* **Background and pointing.** QLP background −202 e/s at the event against a sector median of −136, with a slope of only 3.6 e/s/d. Pointing jitter in transit is 0.9× the sector median.
* **Other stars.** 25 QLP stars on camera 4 / CCD 2 in S88 show no same-time dip (median depth/σ −0.09; 0 of 25 above 3σ).
* **Conclusion.** Nothing instrumental is needed to explain the dip. It is produced by the star's own light curve.

## 4. Location (`figs/pixels_s88.png`, `data/step4_pixels.json`)

* **Variability amplitude image.** Each pixel was regressed on the smoothed light curve. The image is centred 4.5″ from the median-image photocentre, in the direction away from the 13″ neighbour. The two halves of the sector differ by 0.4 px (8″), so the centroid error is about 4″.
* **Dip image.** The per-pixel 4 h box image is centred 2.0″ from the photocentre. Its pixel-by-pixel ratio to the variability amplitude is roughly constant (0.013 ± 0.007), as expected if the dip and the variability come from the same source.
* **Neighbour depths.** To make a 12 ppt dip, the 12.9″ neighbour (T 16.6) would need a 37% eclipse and the 62″ stars 12–85% eclipses. Neither image points to them.
* **Unresolved companion.** The RUWE companion at ≲1″ cannot be separated from the target by TESS or Gaia's image parameters.

## 5. All sectors

* **No repeat.** No transit-like dip repeats away from a brightening. Every `DET_FLUX` dip above ~6 ppt in the 73-brightening stack lies 0.17–0.38 d after a brightening maximum (top five listed in the verdict).
* **Brightenings outnumber dips.** The vet itself found a 12.1σ brightening (3697.27) to match its 12.6σ dip. Of the 231 brightenings above 1.5%, the event's raw 11 ppt `DET_FLUX` dip is deepest (frac ≥ event 0.4%). Once each brightening's shape is modelled, it no longer stands out (6.8%).
* **Not tested.** Periods and aliases are meaningless here, and odd/even cannot be tested without a second event.

## 6. Face-value fit (`data/step6_fit_s88.json`)

* **Setup.** batman fit of QLP `DET_FLUX` S88 within ±1 d, with a quadratic baseline, P fixed at 500 d and LD (0.32, 0.25).
* **Result.** k = 0.117 (13.7 ppt), b ≈ 0.8, T14 6.6 h. ρ★ 2–13 ρ☉ within Δχ² < 4, against ~0.4–0.9 ρ☉ for a 1.15–1.43 R☉ F star (Δχ² = 86 at 0.55 ρ☉).
* **Interpretation.** A central transit at P = 500 d would last ~20 h, so the fit needs a grazing geometry or a much shorter period. Since the feature is the flank of a brightening, this fit only says the shape is not a natural transit of this star at long period.

## 7. Prior knowledge

* **ExoFOP:** no TOIs, CTOIs, imaging, spectroscopy, time series, stellar companions or notes. Names: 2MASS J05254917-6010222, UCAC4 150-005747, APASS 29837394, WISE J052549.16-601022.1.
* **TOI and CTOI lists:** not present (8152 and 5140 lines).
* **AAVSO VSX** (72″): no objects, so the 2-d variability appears to be uncatalogued.
* **SIMBAD:** BPS CS 31076-0054, type `*`, one reference (Beers et al. 2007).
* **Gaia DR3:** no `vari_summary` or `vari_classifier_result` entry (no epoch photometry published).
* **VizieR:** unreachable (502 on CfA, timeouts on CDS and IUCAA). The TESS EB catalogue and Gaia variability classifier were not checked through VizieR; the Gaia tables were queried directly.

## What would change the verdict

* **A second dip of ≳10 ppt and ~4–6 h, well away from a brightening** (more than ~0.6 d from a maximum), in later TESS sectors or ground photometry.
* **A variability model that leaves a one-sided residual at the event.** For example, a GP fitted jointly over S88 that leaves a ≳7 ppt dip at the event with no counterpart on the rising flank.
* **Spectroscopy showing what the companion is.** This would not make the dip a planet, but would say where the variability comes from.

None of these is worth requesting on present evidence.

## Not checked

* **The physical nature of the ~2 d brightenings** (pulsation, activity or binary).
* **A Gaussian-process model of the variability.** The empirical stretchable template leaves about ±8 ppt of structure around tall brightenings.
* **Pre-2025 HLSPs** (eleanor-lite, TASOC, T16, TGLC for S9–S11 were downloaded but not used). None cover S88.
* VizieR catalogues; ASAS-SN and ATLAS light curves.

## Pipeline note

1. **Measure variability on SAP, not on the detrended flux.** The vet's "no variability above 0.5 ppt" was computed after QLP's detrending had removed a 3–15% signal.
2. **Reject single events on a brightening's flank.** If a single event sits within ~0.5 d of a local maximum in SAP that is several times deeper than the event, re-measure it against a model of that maximum (or a stack of the star's other maxima) before scoring it.
3. **Treat the vet's own flags here as one symptom.** The "brightening of similar significance" (uniqueness), the "secondary at 46% depth" (3833.73) and detrending sensitivity were all the same variability. A rule that ties these together would have caught it.

## Files

Run the scripts with `../.venv/bin/python -W ignore <script>` from this folder.

* **Helpers:** `cfg.py`, `lcio.py`, `measure.py`.
* **Scripts:** `step1_products.py`, `step1_tic.py`, `step1_gaia.py`, `step1_download.py`, `step1_tesscut.py`, `step2_look.py`, `step2_var_overview.py`, `step2_peaks.py`, `step2_peakstack.py`, `step2_template.py`, `step3_flags.py`, `step3_neighbors.py` (args: 88 3712.786 2), `step4_pixels.py`, `step6_fit.py`, `step7_catalogs.py`.
* **Figures (`figs/`):** `raw_window_3713.png`, `all_sectors_sap.png`, `peak_relative_depths.png`, `peak_stack.png`, `event_template_fit.png`, `pixels_s88.png`.
* **Data (`data/`):** `tic.json`, `tic_60arcsec.csv`, `gaia_target.json`, `gaia_2arcmin.csv`, `gaia_nss_vari.json`, `step2_var_overview.json`, `step2_peaks.json`, `step2_peakstack.json`, `step2_template.json`, `step3_flags.json`, `step3_neighbors_s88.json`, `step4_pixels.json`, `step6_fit_s88.json`, `step7_catalogs.txt`, `exofop.json`, plus the downloaded FITS files (`lc/`, `lc_neighbor/`, `tesscut/`).
