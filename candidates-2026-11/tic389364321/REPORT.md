# TIC 389364321 (HD 270019 = Sk −69 282): follow-up of the single-transit find (BTJD 2145.622)

Analysis run 2026-11-02. It uses public data only: MAST (10 SPOC 2-min sectors S28–39, 10 TESS-SPOC, 36 QLP, the S30–32 2-min target pixel files, TESScut for S30–32, and 15 other S31 2-min light curves), Gaia DR3 (ESA archive), SIMBAD (CfA mirror), the AAVSO VSX API, and ExoFOP (read only). Nothing was submitted anywhere.

## Verdict: **stellar variability.** The dip is one trough of the stochastic low-frequency variability of an LMC blue supergiant. It is not a planet in any interpretation

**The host is not a dwarf.** It is **HD 270019 = Sk −69 282**, an OB star in the Large Magellanic Cloud, 19′ east of 30 Doradus.

| Evidence | Value |
|---|---|
| Gaia DR3 parallax | 0.002 ± 0.021 mas, consistent with the LMC's 0.020 mas |
| Gaia DR3 proper motion | (1.88, 0.75) mas/yr, the LMC motion |
| SIMBAD radial velocity | +271.5 km/s (Neugent+2012), the LMC velocity. A Milky Way star would be at about 0–50 km/s |
| Gaia temperature and gravity | GSP-Phot 22.7 kK; ESP-HS spectral type **B**, 19.6 kK, **logg 2.60** |
| Luminosity and size | M_G ≈ −7.1, **log L/L☉ ≈ 5.5–5.65**, **R★ ≈ 45 R☉** (43–48 R☉), M ≈ 25–30 M☉ |

The TIC entry is broken:
* d = 14 kpc comes from a negative DR2 parallax.
* Tmag 10.0 ± 0.6 is wrong. The SPOC aperture flux implies T ≈ 11.8.
* There is no radius.

**Five findings decide it:**

1. **The star varies by ±20–30 ppt in every sector.** PDCSAP rms is 6.4–10.6 ppt per sector.
   * The amplitude spectrum is a red-noise profile, not coherent pulsation: α₀ = 2.6 ppt, ν_char = 0.60 c/d, γ = 3.5. That is the textbook stochastic low-frequency (SLF) variability of OB supergiants.
   * The highest peak moves from 0.14 to 0.36 c/d between sectors.
   * The vet's "pulsations" (40–65 h) and its "9.68 d" are pieces of this red noise.
2. **The variability and the dip come from the target's own pixels.** A per-pixel regression on the S31 TPF puts the variability on the target PSF: A/flux = 1.2 in the core pixels against 0.16 on the T≈12 neighbour 3 px away. The event's deficit image has the same shape. The dip is the star getting fainter, not a blend.
3. **Phase-randomised surrogates with the star's own power spectrum produce a dip this deep in 36% of 10-sector datasets.** The test runs the sweep statistic (an 8 h trapezoid on a ±1 d quadratic baseline) on 200 surrogate sets.
   * Real data: the deepest dip is 8.56 ppt, at the event.
   * Surrogates: the median of the deepest dip is 8.25 ppt and the 95th percentile is 10.0 ppt.
   * The event is the extreme of a red-noise distribution. It is not an outlier from it.
4. **The shape is a smooth trough, not a transit.** The flux declines for about 0.5 d and recovers for about 0.3 d, with no ingress or egress.
   * A face-value batman fit (P = 596 d) gives a grazing solution: k = 0.42, b = 1.27, T14 = 26 h.
   * That fit needs ρ★ 200× the supergiant's density.
5. **Even a real eclipse could not be a planet.**
   * Depth 7.6–10 ppt on a 45 R☉ star needs a body of **R ≥ 4.0–4.6 R☉ (≈ 40 R_J)**, which is a star.
   * A central transit at P = 11–1270 d would last **81–337 h**. An 8 h event needs b ≈ 1.09–1.10, a grazing chord at every allowed period.

## Status of each step

| # | Step | Status |
|---|---|---|
| 1 | Host: Gaia DR3 (astrometry, GSP-Phot, ESP-HS), SIMBAD, TIC, LMC membership | **verified**: LMC B supergiant, R ≈ 45 R☉. There is no Gaia RV; the SIMBAD RV is 271.5 km/s |
| 2 | Depth in SPOC PDCSAP/SAP, TESS-SPOC, QLP, own TPF photometry; background | **verified**. All agree once QLP's amplitude compression is allowed for (see §2) |
| 3 | Variability: periodogram, red-noise fit, dip ranking, surrogates | **verified**: the dip is consistent with the star's own noise (p = 0.36) |
| 4 | Flags, dumps, background, jitter, 15 same-CCD stars, difference image, aperture growth | **verified**: no systematic; the dip is on-target |
| 5 | All sectors: repeats and periods | **moot**. No comparable trough in SAP (next deepest 6.3 ppt), but red noise needs no repeat |
| 6 | Size and duration for the real star | **run**: ≥ 4 R☉ body, grazing only. Not planetary |
| 7 | ExoFOP / TOI / CTOI / VSX / SIMBAD / OGLE | **partial**: no TOI/CTOI on ExoFOP; VSX API has nothing within 72″ for the target; VizieR (all mirrors) unreachable; OGLE not queried |

---

## 1. Host star (`data/tic.json`, `data/step1_gaia*.txt`, `data/step6_size.json`)

| Quantity | Value |
|---|---|
| Names | HD 270019, Sk −69 282, CPD −69 507, TYC 9163-923-1, Gaia DR3 4657730168102936704 |
| SIMBAD | spectral type OB (1970CoTol..89....1S); otype "pA?"; RV 271.5 km/s (2012ApJ...749..177N) |
| Photometry | G 12.00, BP−RP 0.013, V 12.0–12.2, J/H/K 11.99/11.96/11.94 |
| Gaia DR3 astrometry | ϖ 0.0023 ± 0.0208 mas, μ (1.879 ± 0.024, 0.749 ± 0.028) mas/yr, RUWE 0.88, ipd_frac_multi_peak 0, NSS 0 |
| Gaia GSP-Phot | Teff 22.7 kK, logg 3.68, A_G 0.70, R 7.37 R☉ at its (wrong) 8.1 kpc, which is **44.9 R☉ rescaled to 49.6 kpc** |
| Gaia ESP-HS | spectral type B, Teff 19.6 kK, **logg 2.60**, vsini 31 ± 22 km/s |
| Gaia variability tables | no vari_summary or vari_classifier entry (phot_variable_flag NOT_AVAILABLE) |
| Derived (DM 18.48, BC −1.9 to −2.2) | M_G −7.1 to −7.2, log L 5.49–5.65, R 43–48 R☉, M(logg) ≈ 30 M☉, ρ★ ≈ 2.6×10⁻⁴ ρ☉ |
| TIC 8.2 (wrong) | Tmag 10.0064 ± 0.6, d 14050 pc (from DR2 ϖ −0.19 mas), no Teff, R or M |

The S31 SPOC aperture gives 2730 e⁻/s. With FLFRCSAP 0.87 and CROWDSAP 0.89, that implies T ≈ 11.8, 1.8 mag fainter than the TIC Tmag. The SAP background is 2770 e⁻/s summed over the aperture, as large as the star, because of the 30 Dor nebulosity.

## 2. Depths (`data/step2_archival.json`, `data/step2_qlp_vs_spoc.json`, `data/step4_pixels.json`)

`measure.py`: an 8 h trapezoid at 2145.622 on a ±1 d quadratic baseline, quality = 0 cadences only. The error is max(σ_white·β, σ_emp). β of 3.4–5.9 shows the noise is strongly red.

| Product (S31) | Depth [ppt] |
|---|---|
| SPOC PDCSAP / SAP | 10.05 ± 2.27 / 8.19 ± 2.20 |
| TESS-SPOC PDCSAP / SAP | 8.50 ± 2.16 / 8.14 ± 2.21 |
| QLP SAP / KSPSAP | 1.55 ± 0.43 / −0.03 ± 0.13 (KSPSAP is high-pass filtered and removes the variability) |
| Own TPF photometry, r = 1 / 1.5 / 2 / 2.5 / 3 / 4 px | 9.4 / 8.7 / 7.9 / 7.6 / 6.7 / 3.8 ± 1–2.5; the fall is the neighbours' dilution, and background-subtracted values are within 0.5 ppt |

**The "pipelines disagree" flag is a global amplitude scaling, not something specific to the dip.**
* In every sector except S32, QLP SAP tracks SPOC SAP at r = 0.88–0.99 with a slope of only 0.14–0.21. In S32 the slope is 1.33.
* The QLP event depth matches: 1.55 ≈ 0.21 × 8.2 ppt.
* A factor of about 1/5 matches the 1.8 mag error in the TIC Tmag (10^(−0.4·1.8) = 0.19). QLP's flux scaling plausibly depends on it. This explanation is not verified against the QLP code.
* The vet's "QLP 0.0138 ppt" also looks like a fraction/ppt unit slip.

## 3. The variability (`data/step3_variability.json`, `figs/step3_variability.png`, `figs/step2_all_spoc.png`)

* **Red-noise fit** (median amplitude spectrum of 10 sectors): α₀ 2.58 ppt, ν_char 0.60 c/d (τ ≈ 0.26 d), γ 3.53, white floor 0.07 ppt. An 8 h timescale (3 c/d) sits on the steep part of the profile.
* **Dip ranking.** The same statistic slid every 0.05 d over all 10 sectors:
  * SAP: the event is **rank 1 of 480** independent extrema (8.6 ppt; next 6.3, 6.0, 5.7).
  * PDCSAP: it is **rank 2 of 482** (11.0 ppt). Rank 1 is S29 2108.34 at 16.4 ppt, a PDC step. Rank 3 is S31 2151.11 at 10.4 ppt, which follows the 2150.92 momentum dump.
  * The white-noise "SNR" of ordinary troughs is 15–27, so SNR means nothing here.
* **Surrogates** (`step5_surrogates.py`, `data/step5_surrogates.json`). There are 200 phase-randomised realisations of all 10 SAP sectors (30-min bins, real gaps re-imposed).
  * Distribution of the deepest dip: median 8.25 ppt, 95th percentile 10.0 ppt.
  * P(deepest ≥ observed 8.56 ppt) = **0.36**. Per sector it is 0.044, as expected for 1 of 10 sectors.
* **Comparison.** In absolute flux the S31 trough (about −11 ppt in 1 h bins) is shallower than many others, for example −20 ppt at 2120 and 2141 in S30. It scores highest only because it is narrower than average and sits 1.1 d after the sector start, where the ±1 d baseline is one-sided.

## 4. Systematics and localisation (`data/step3_flags.json`, `data/step3_neighbors.json`, `figs/step3_flags.png`, `figs/step4_pixels.png`)

* **Quality flags.** None in the event; 100% of event cadences have quality = 0.
* **Momentum dumps.** The nearest is at the sector start (2144.51), 1.1 d before the event. The others are at 2150.92, 2158.86 and 2165.40.
* **Jitter.** The in/out ratio is 0.94. The centroid shift is below 1 mpx.
* **Background.** It changes by +1.1 e⁻/s in the event, against 2770 e⁻/s. That is ≤ 0.4 ppt even if fully mis-subtracted.
* **15 other S31 2-min stars**, all on camera 4 CCD 3 within 0.32° (T 8.5–12.7): the same box gives −1.6 to +0.95 ppt, all consistent with zero. One star shows −11 ppt, a brightening, and is a variable. The dip is not common-mode.
* **Pixels.**
  * The variability-amplitude image and the event-deficit image both peak on the target pixel (6,6) with a PSF shape.
  * The event deficit is 1.40% of the SPOC-aperture flux, and only 0.06% on the neighbour 3 px away.
  * The depth falls with aperture size only as the neighbours' dilution requires.
* **The brightening flagged by the vet at 4028.26** is in QLP S98, the same red noise of the opposite sign. The scan finds brightenings of −7 to −9 ppt in SPOC as well. One of them is at S31 2145.16, the hump just before the event.

## 5. All sectors

SPOC 2-min covers S28–39 (about 250 d). QLP adds S1–13, 27 and 61–98. Nothing in SAP comes close to the event (next ≤ 6.3 ppt). Because the trough is consistent with the star's noise process, no period analysis is meaningful. The vet's P ≳ 10.9 d and "≈ 596 d" estimates are moot.

## 6. Size and duration for the real star (`data/step6_size.json`)

| Quantity | Value |
|---|---|
| R★ / M★ adopted | 45.6 R☉ / 25 M☉; contact-orbit period 7.1 d |
| Body for depth 7.57 / 8.2 / 10.0 / 15.8 ppt (non-grazing) | **3.97 / 4.13 / 4.56 / 5.73 R☉** (39–56 R_J) |
| Central T14 at P = 10.9 / 30 / 100 / 596 / 1270 d | 81 / 100 / 145 / 262 / 337 h |
| b needed for an 8 h chord (k = 0.1) | 1.09–1.10 at every P, a near-tangent graze |
| Face-value batman fit (P 596 d) | k 0.42, b 1.27, T14 25.7 h, ρ★ 0.053 ρ☉ (200× the supergiant's) |

A real eclipse of this star would last days, and it would need a stellar-size body. An 8 h dip is not a transit of this host.

## 7. Catalogs (`data/step7_catalogs*.txt`, `data/exofop.json`)

* **ExoFOP.** No TOIs, CTOIs, imaging or spectroscopy. Not in the TOI list (8152 lines) or the CTOI list (5140 lines).
* **AAVSO VSX API, 72″ radius.** No entry for the target. The three nearby entries are fainter Gaia variables at 23–54″ (G 15.3–18.5).
* **SIMBAD.** HD 270019 / Sk −69 282, type OB, 27 references, no variability type.
* **VizieR.** Unreachable on every mirror tried (CfA returned 502; CDS and IUCAA timed out), so VSX-VizieR, the OGLE LMC EB catalogs and the TESS EB catalog were not queried. The OGLE web server was up but was not queried. At I ≈ 12 the star is near OGLE-IV saturation.

## What would change the verdict

Nothing realistic. A planet is excluded by the host's radius alone. A real stellar eclipse would need repeated, flat-bottomed or V-shaped events lasting days, phased on a period. No sector shows that.

## Pipeline notes

1. **Reject or flag hosts that are not dwarfs before the single-event search.** Use Gaia: ϖ/σ < 1 with LMC/SMC proper motion, or ESP-HS logg < 3.5, or GSP-Phot Teff > 15 kK. The vet's "host type: main-sequence dwarf: pass" was wrong; the TIC has no radius.
2. **Calibrate single-event significance against the star's own red noise.** Use phase-randomised or GP surrogates, not white noise. The vet's 40σ became p = 0.36.
3. **Fix the false pipeline-disagreement flag.** Compare QLP and SPOC through their regression slope over the whole sector before raising it.
4. **Sanity-check Tmag against the measured aperture flux.** Here they differ by 1.8 mag.

## Files

Scripts: `step1_tic.py`, `step1_gaia.py`, `step1_gaia2.py`, `step1_products.py`, `step1_download.py`, `step2_look.py`, `step2_archival.py`, `step2_qlp_vs_spoc.py`, `step3_variability.py`, `step3_flags.py`, `step3_neighbors.py`, `step4_pixels.py`, `step5_surrogates.py`, `step6_size.py`, `step7_catalogs.py`, `step7_catalogs2.py`, plus `lcio.py`, `measure.py` and `common.py`. Run them with `../.venv/bin/python -W ignore` from this folder.

Figures (`figs/`): `step2_window_s31.png`, `step2_all_spoc.png`, `step3_variability.png`, `step3_flags.png`, `step4_pixels.png`.
