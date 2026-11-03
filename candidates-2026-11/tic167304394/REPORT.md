# TIC 167304394: follow-up of the single-transit find (BTJD 2169.292)

Analysis run 2026-11-02. It uses public data only: MAST (QLP light curves for 35 sectors, S1–S93; ELEANOR-lite and TASOC year-1 files, which don't cover the events; TESScut for S31, S67 and S89), Gaia DR3 (ESA archive), TIC 8.2, SIMBAD (CfA TAP mirror), the AAVSO VSX API, and ExoFOP (target JSON, TOI and CTOI lists, read only). Nothing was submitted anywhere.

## Verdict: **eclipsing binary.** The star is a grazing, eccentric eclipsing binary with P = 22.7798 d, not a single transit

* **The "single 3.66 ppt dip" is one of 38 identical eclipses.** Each is 61 ppt deep, 3.4 h long and V-shaped. Every sector that covers a predicted time shows one (S1–S13, S27–S39, S61–S69, S87–S93).
  * Linear ephemeris: **T0 = 2169.22092 ± 0.00006 BTJD, P = 22.779782 ± 0.000002 d**, O−C rms 0.54 min (χ²/dof 1.0), depths 59.2–63.7 ppt (scatter 1.4 ppt).
  * The sweep and the vet put the event 1.7 h after its real centre (2169.292 instead of 2169.221).
  * At that wrong centre the vet measured 17 ppt. The sweep's 3.66 ppt is a further factor of ~5 lower (see the pipeline note).
* **The vet's "dip at 3148.78" is epoch 43.** 3148.7519 − 2169.2210 = 979.531 d = 43 × 22.7798 d. It has the same depth (60.4 vs 63.2 ppt) and half-width (1.689 vs 1.687 h).
* **There is a secondary eclipse at phase 0.7387.**
  * Folded data: 1.0 ppt in a 3.4 h box (8.7σ against independent boxes), positive in all 30 individual epochs (0.4–2.2 ppt).
  * Stacked 200-s sectors: 1.74 ppt deep, 1.9 h wide (white SNR 15).
  * The phase gives e cos ω ≈ 0.37. A 1.7 ppt occultation on a 22.8 d orbit around a 5300 K star is too deep for a planet's thermal or reflected light. It is the eclipse of a cool, self-luminous star.
* **Odd and even eclipses are identical:** 60.81 ± 0.19 vs 60.89 ± 0.26 ppt; half-widths 1.68 vs 1.69 h.
* **The eclipser is star-sized.** Every fit is grazing (b ≈ 1.0–1.1) with R₂/R₁ ≥ 0.46. That rises to 0.52–0.66 if one member of the Gaia pair below is the eclipsed star. For R₁ ≈ 0.84 R☉ this means at least ~0.38 R☉ (≥ 40 R⊕).
* **Gaia sees a close pair and a variable radial velocity.**
  * Gaia DR3 resolves "the star" into two near-equal sources 0.36″ apart: G 12.79 and G 12.64.
  * Both have only 2-parameter astrometry (no parallax), ipd_frac_multi_peak 90–95 and very large astrometric excess noise. That is why the TIC has no Gaia id.
  * The G 12.79 source has **RV 78.9 km/s, rv_amplitude_robust 51.8 km/s and rv_chisq_pvalue 0.0 over 26 transits**.
  * Expected signal: a ~0.3 M☉ companion to a ~0.85 M☉ K dwarf at P = 22.8 d with e ≈ 0.4 gives K₁ ≈ 22–25 km/s, about 50 km/s peak to peak. That matches.
* **The other vet flags are explained:**
  * **3733.31 "repeat":** not in raw flux (QLP SAP −0.45 ± 0.48 ppt, own TESScut −0.5 ± 0.4 ppt). It appears only in QLP DET/SYS_RM (2–3.6 ppt), right after a gap (3732.92–3733.19) and a momentum dump (3733.155), while the background ramps from 600 to 1000 e⁻/s. It sits at phase 0.66, which is neither eclipse.
  * **3000.02 "brightening":** SAP gives −0.7 to +0.2 ± 0.5 ppt. Nothing is there.
  * **"First half 188% deeper":** a product of the 1.7 h centre offset. About the true centre, the ingress and egress halves are 31.0 and 31.5 ppt.

**Confidence.** Very high (>99.9%) that this is a stellar eclipsing binary and not a planet. The evidence: 38 eclipses on a strict ephemeris, a 61 ppt V-shaped grazing primary, a significant eccentric secondary, Gaia RV variability, and a companion of ≥ 0.4 R☉. Which member of the 0.36″ pair is eclipsed is undetermined, and the answer doesn't change the verdict.

## Status of each step

| # | Step | Status |
|---|---|---|
| 1 | Host: TIC 8.2, Gaia DR3 cone search (position match), binarity indicators, NSS and variability tables | **verified**: 0.36″ Gaia pair with no parallax; Gaia RV variable (amplitude 52 km/s, p = 0); no NSS, vari or EB entry for either component |
| 2 | Depths in every QLP column (SAP, KSPSAP, DET, SYS_RM, SML, LAG) and own TESScut photometry (4 apertures × 3 backgrounds, including column-wise) | **verified**. No SPOC or TESS-SPOC products exist. ELEANOR-lite and TASOC cover year 1 only |
| 3 | Flags, dumps, gaps, scattered light; comparison stars in the cutout | **verified**: the eclipses are clean. Only the vet's 3733.31 sits at a dump and gap edge |
| 4 | Difference images (S31, S67); Gaia neighbours and the eclipse depth each would need | **verified**: the source is on target within 2–3″; every resolved neighbour is excluded |
| 5 | All sectors: the 3733.31 and 3148.78 events, box search, periods 979.53/n, secondary, odd/even | **verified**: n = 43 (P = 22.78 d), confirmed by 36 further eclipses |
| 6 | batman fit, density, asymmetry | **run**: grazing and degenerate; the asymmetry is an artifact of the wrong centre |
| 7 | ExoFOP, TOI, CTOI, VSX, SIMBAD | **run**: nothing known. VizieR failed on both the CDS and CfA mirrors (TESS EB catalog and VizieR VSX not checked); the AAVSO VSX API answered |

---

## 1. Host star

| Quantity | Value |
|---|---|
| TIC 8.2 | Teff 5284 ± 125 K, R 0.838 R☉ (no logg, mass, density, distance or parallax), Tmag 11.47, V 12.30, J 10.71, Ks 10.17, contamination ratio 0.147, **no Gaia id**; 2MASS J06320029-6718171 |
| Gaia DR3 5283324796495406336 | 0.11″ from the TIC position, G 12.79, BP−RP 1.02, **2-parameter solution (no parallax or pm)**, ipd_frac_multi_peak 95, astrometric_excess_noise_sig 4115, **RV 78.87 ± 3.85 km/s, rv_amplitude_robust 51.8 km/s, rv_chisq_pvalue 0.0, 26 transits** |
| Gaia DR3 5283324796501685888 | 0.34″ from the TIC position (0.36″ from the first source), G 12.64, BP−RP 1.03, 2-parameter solution, ipd_frac_multi_peak 90, astrometric_excess_noise_sig 2.2×10⁵, no RV |
| Combined G | 11.96; flux fractions 0.47 / 0.53 |
| Gaia NSS (two-body orbit, acceleration, non-linear spectro, VIM), vari_summary, vari_eclipsing_binary, vari_classifier | no entries for either source |

With no parallax, the luminosity class and radius of either component are unknown. The TIC radius comes from Teff under a dwarf assumption.

## 2. Depths

**Methods.** QLP columns: the `measure.py` 3.4 h trapezoid with a quadratic baseline per segment, on q = 0 cadences. Own TESScut photometry: a fixed V template (half-width 1.688 h, shape exponent 1.39) plus a quadratic baseline. Results are in `data/step2_archival.json` and `data/step2_own_phot.json`.

| Event | Product | Depth [ppt] |
|---|---|---|
| S31 2169.221 | QLP SAP / KSPSAP / SML / LAG (trapezoid, i.e. box-averaged) | 39.3 / 39.1 / 38.1 / 39.7 (± 2.4) |
| | V-shape fit to QLP SAP (peak depth) | **63.2 ± 1.0** |
| | Own TESScut, r = 1.0 / 1.5 / 2.5 / 3.5 px (global background) | **59.7 / 53.7 / 49.8 / 46.1** (± 0.4–0.7) |
| | Same apertures, annulus / column-wise background | 59.8 / 54.0 / 50.5 / 47.1 and 59.7 / 53.7 / 49.6 / 46.0 |
| | Comparison stars in the cutout (9–11 px away) | −2.2 ± 1.5, −0.1 ± 1.4 |
| S67 3148.752 | QLP SAP / DET / SYS_RM (trapezoid) | 39.1 / 38.8 / 39.1 (± 1.7) |
| | Own TESScut, r = 1.0 / 1.5 / 2.5 / 3.5 px | **57.1 / 53.2 / 49.3 / 46.5** (± 0.5–0.7); the other backgrounds agree to within 0.3 ppt |
| | Comparison stars | −0.4 ± 1.1, +0.9 ± 1.1 |
| S31 at the vet's tc 2169.292 | QLP SAP | 14.0 ± 6.7 (the box straddles the egress) |
| S89 3733.31 (vet "repeat") | QLP SAP | **−0.45 ± 0.48** |
| | QLP DET / SYS_RM | 3.6 ± 0.7 / 3.1 ± 0.7 |
| | Own TESScut, r = 1.0 / 2.5 px | **−0.5 ± 0.4 / +0.1 ± 0.4** |
| S62 3000.02 (vet "brightening") | QLP SAP / DET | −0.7 ± 0.7 / −0.1 ± 0.5 |

The own-photometry depth falls slowly with aperture, from 60 to 46 ppt. That is the dilution expected as neighbours enter the aperture; the 22″, G 14.0 star enters at r ≥ 1 px. It is not a blurred-PSF signature: the deficit's PSF width equals the star's (§4).

## 3. Systematics

From `step3_flags.py`.

* **S31.** The eclipse spans 2169.15–2169.29. Only one cadence in it is flagged: q = 4096, the QLP stray-light flag, which covers 2168.32–2169.94. The nearest momentum dump is at 2168.86, 0.3 d earlier. Depth and shape are unchanged whether or not q = 4096 cadences are included.
* **S67.** No flagged cadence falls in the eclipse. Manual-exclude cadences sit 1.2–1.5 d earlier, and a dump at 3147.92, 0.8 d earlier.
* **S89, 3733.31.** The vet's "repeat" falls in the first hours after a 0.27 d gap (3732.92–3733.19) and a dump (3733.155). The QLP background ramps from 590 to 1010 e⁻/s across it, and the dip appears only in the detrended columns.
* **Strict periodicity over 7 years.** The same 61 ppt eclipse appears in 38 epochs, on 5 camera/CCD combinations and at 3 cadences (30, 10 and 3.3 min), with O−C rms 0.5 min. No systematic does that.

## 4. Difference image and neighbours

From `step4_diffimage.py` and `figs/diffimage.png`.

* **Method.** In-eclipse frames (±0.9 h) are subtracted from out-of-eclipse frames (0.2–0.6 d either side). A Gaussian PSF is fitted to both the deficit and the star image.
* **S31.** The deficit is 37.7 ppt of the flux within 5 px, with peak SNR 64. Its width is 0.59 px against the star's 0.62 px. It sits **2.8 ± 0.6″** from the star-image centroid.
* **S67.** The deficit is 38.9 ppt, width 0.75 vs 0.73 px, offset **2.3 ± 1.4″**.
* **Reading the offsets.** The formal errors are underestimates. The 22″ neighbour holds about 13% of the light and pulls the star-image centroid toward itself. The offsets are therefore consistent with the unresolved 0.36″ pair and inconsistent with every resolved neighbour.

"Needed eclipse" below is the fractional depth each source would need to produce 57.8 ppt in the r = 1 px aperture.

| Source | Sep | G | Needed eclipse | Deficit offset from it |
|---|---|---|---|---|
| 5283324796495406336 (pair A) | 0″ | 12.79 | 12.4% | 5.7σ / 2.3σ (S31 / S67) |
| 5283324796501685888 (pair B) | 0.36″ | 12.64 | 10.8% | 6.4σ / 2.5σ |
| 5283324792200679936 | 8.3″ | 17.58 | 1020%: impossible | – |
| 5283324796500164480 | 22.1″ | 14.03 | 39% | **52σ / 24σ: excluded** |
| 5283324590341747968 | 27.2″ | 16.52 | 386%: impossible | – |
| all others within 90″ | – | ≥ 18.1 | > 1600%: impossible | – |

The eclipse is on the 0.36″ pair. The pixels cannot tell which member. Gaia measured an RV only for source A, so the spectroscopic variability cannot be firmly assigned either.

## 5. All sectors and periods

From `step5_search.py`, `step5_fold.py`, `step5_secondary.py` and `figs/fold.png`.

* **Event centres:** 2169.22096 ± 0.00035 and 3148.75188 ± 0.00029, so ΔT = **979.5309 ± 0.0005 d**.
* **Periods ΔT/n, n = 1…1960.** A period is excluded if some predicted centre has ≥ 3 cadences within ±1.2 h with a median deficit under 20 ppt.
  * Only n = 1 (979.5 d), n = 3 (326.5 d) and n = 43 survive. n = 1 and n = 3 survive only because they predict no covered epoch.
  * **n = 43 (22.7798 d) predicts 31 covered epochs, and all 31 show a median deficit of 45–51 ppt within ±1.2 h.** The one exception is a partial epoch at a gap edge (3854.9, 22 ppt).
* **Refined ephemeris** from 36 well-covered epochs: T0 = 2169.22092 ± 0.00006 BTJD, P = 22.779782 ± 0.000002 d. Per-epoch timings and depths are in `data/step5_fold.json`.
* **Odd/even:** 60.81 ± 0.19 vs 60.89 ± 0.26 ppt. A 45.56 d period with two equal eclipses is ruled out by this, and the phases are covered anyway.
* **Secondary.** A 3.4 h box was run over all phases with the primaries masked (99% phase coverage).
  * **Phase 0.738:** 1.00 ppt, 8.7σ (robust σ of independent boxes 0.116 ppt), positive in every one of 30 epochs.
  * **Stacked 200-s sectors:** 1.74 ppt, 1.9 h wide.
  * **Phase 0.5:** −0.05 ppt.
  * **Next peak:** phase 0.208 at 3.9σ, driven by a single outlier epoch in S87.
* **Orbit shape.** The secondary lasts 1.9 h against the primary's 3.4 h. Together with e cos ω ≈ 0.37, this implies e ≳ 0.37, with ω near 0° or 180°.

## 6. Fit and shape

From `step6_fit.py`, `data/step6_fit.json` and `figs/fit.png`. The model is batman with a circular orbit, P fixed and quadratic limb darkening (0.42, 0.20), fitted to the 13 primary eclipses in the 200-s sectors.

| Dilution assumed | Rp/R★ | b | a/R★ | ρ★ (circular) | rms |
|---|---|---|---|---|---|
| none (single star) | 0.46 | 1.10 | 45 | 2.4 ρ☉ | 2.26 ppt |
| eclipsed star = pair A (0.41 of the light) | 0.66 ± 0.16 | 1.08 | 58 | 5.0 ρ☉ | 2.26 ppt |
| eclipsed star = pair B (0.46 of the light) | 0.53 ± 0.49 | 0.96 | 55 | 4.2 ρ☉ | 2.26 ppt |

* **Every solution is grazing** (b > 1 − Rp/R★), and the eclipse has no flat bottom.
* **The companion is stellar.** Rp/R★ ≥ 0.46 means ~0.4 R☉ or more.
* **The density is not informative.** It is degenerate with b, and the circular assumption is wrong (e ≳ 0.37).
* **There is no real asymmetry.** The vet's "first half 188% deeper" came from its centre being 1.7 h late. About the fitted centre, the ingress and egress halves have mean deficits of 31.0 and 31.5 ppt.

## 7. Prior knowledge

* **ExoFOP:** no TOIs, CTOIs, imaging, spectroscopy, time series or stellar companions. Aliases: 2MASS J06320029-6718171, UCAC4 114-012846, APASS 32464029, WISE J063200.31-671817.1.
* **TOI list** (8152 lines) and **CTOI list** (5140 lines): no match.
* **AAVSO VSX API (60″):** no objects.
* **SIMBAD (CfA TAP, 30″):** UCAC4 114-012846, otype `*`, nothing flagged.
* **Gaia DR3:** no vari_eclipsing_binary or NSS entry. Gaia's sparse sampling easily misses eclipses that cover 0.6% of the orbit.
* **VizieR** (VSX; TESS EB catalog J/ApJS/258/16): CDS timed out and the CfA mirror returned 502. The star has no 2-min data, so it would not be in the Prša et al. 2-min EB catalog anyway.

As far as these sources go, the binary is uncatalogued.

## What would change the verdict

Nothing realistic. Each of these alone rules out a planet: the 22.78 d periodicity, the 61 ppt grazing depth, the eccentric secondary, and the Gaia RV scatter.

To characterise the system:
* A few high-resolution spectra would give the RV orbit (K₁ ≈ 25 km/s expected; possibly double-lined) and the companion mass.
* AO or speckle imaging would show which member of the 0.36″ pair is eclipsed.

## Not checked

* VizieR VSX and the TESS EB catalog (both VizieR mirrors were unreachable); FFI-based EB catalogs; ASAS-SN variables.
* The sweep's own light curve and code. The explanation of the 3.66 ppt depth below is a reproduction from QLP data, not a reading of the sweep code.
* Which member of the Gaia pair carries the eclipse and the RV variability.
* Eccentric (e, ω) light-curve and RV modelling.

## Pipeline note

**Why the vet's period recovery missed 37 repeats at 61 ppt, given a 3.66 ppt find**

1. **Repeat matching is keyed to the sweep's depth.**
   * The recovery check reported "found the 3.66 ppt transit 1 more time … same depth and duration" and accepted BTJD 3733.31 at 5.03 ppt. That is a detrending artifact at a gap and momentum-dump edge.
   * The vet's 16 sectors (31, 36–39, 61–69, 87–93) contain about 22 real eclipses, each 61 ppt at its true centre, or about 17–25 ppt in a 3 h box. All are 5–17× deeper than the 3.66 ppt template.
   * A "same depth" tolerance rejects every one of them. A 61 ppt repeat of a 3.66 ppt event should never be discarded; it means the original depth estimate is wrong.
2. **The vet saw them but filed them elsewhere.**
   * The secondary-eclipse check found "another significant dip at BTJD 3148.78 (146% of the depth)", which is one of these eclipses. That check reports only the deepest other dip, so it never revealed that dozens existed.
   * The same check claimed a 1.42 ppt eclipse limit "anywhere in 347 d", which cannot be true when 22 dips of 60 ppt are in the data.
   * **Fix:** count all events above threshold, and fold any two of similar depth before labelling a find "single".
3. **The sweep's light curve gutted the eclipse.**
   * The sweep reports 3.66 ppt where the raw QLP SAP box depth at the same tc is 16.9 ppt, and the true peak is 61 ppt.
   * Clipping outliers below the median at about 15σ (σ = 1.29 ppt) removes the 6 deepest of the 18 in-box cadences. The same box then measures **3.85 ppt**. At 3–5σ it measures 1.2 ppt. (`step8_sweepdepth.py`)
   * So an outlier clip applied before the search plausibly ate the eclipse cores across every sector. Only the wings of the S31 and S35 events survived, as a shallow single-looking dip.
   * **Fix:** never clip low outliers before the transit search (clip only high ones), or restore clipped cadences around any detection and re-measure.
   * **Checked afterwards against the code:** the sweep's search clips only upward outliers (`clipUpper` in `web/src/lib/sky/timeseries.ts`), so this explanation doesn't apply as stated. The likelier cause is its prewhitening (sinusoids fitted and removed before the search; see item 5), not yet verified.
4. **The centre was wrong by 1.7 h.** The sweep and vet tc of 2169.292 sits on the egress. This produced the false "asymmetric, first half 188% deeper" flag and a further underestimate of the depth. Refit tc (and duration) on unclipped raw flux before any shape or recovery test.
5. **Variability removal can absorb eclipses.** The vet's pulsation step removed 44 sinusoids at 14–61 h periods, and the S31 depth fell from 17 to 14.6 ppt. Run period recovery on raw SAP, not on the pulsation-cleaned flux.
6. **When the TIC has no Gaia id, query Gaia by position.** Here that immediately shows a 0.36″ pair with 2-parameter solutions, ipd_frac_multi_peak 90–95 and rv_chisq_pvalue = 0. Each of these is a binary flag, and the vet's multiplicity check was "not run" only because the id was missing.

## Files

Run every script with `../.venv/bin/python -W ignore <script>` from this folder.

**Scripts:**
* Shared modules: `common.py`, `lcio.py`, `measure.py`
* Step 1: `step1_products.py`, `step1_tic.py`, `step1_download.py`, `step1_coverage.py`, `step1_tesscut.py`
* Step 2: `step2_look.py`, `step2_zoom.py`, `step2_archival.py`, `step2_own_phot.py`
* Steps 3–4: `step3_flags.py`, `step4_diffimage.py`
* Step 5: `step5_search.py`, `step5_fold.py`, `step5_secondary.py`
* Step 6: `step6_fit.py`
* Step 7: `step7_catalogs.py`, `step7_catalogs2.py`
* Step 8: `step8_sweepdepth.py`

**Figures (`figs/`):**
* `raw_window_{main_s31,dip2_s67,rep_s89,bright_s62}.png`
* `events_overlay.png`
* `own_phot.png`
* `diffimage.png`
* `fold.png`
* `fit.png`

**Data (`data/`):**
* Star and neighbours: `tic.json`, `gaia_2arcmin.csv`
* Depths and pixels: `step2_archival.json`, `step2_own_phot.json`, `step4_diffimage.json`
* Search and fits: `step5_search.json`, `step5_fold.json`, `step5_secondary.json`, `step6_fit.json`
* Catalogs: `step7_catalogs.json`, `step7_catalogs2.json`
* Arrays: `detrended_sap.npy`, `boxscan.npy`
* Downloads: light curves in `lc/`, TESScut cutouts in `tesscut/`
