# TIC 177239679: follow-up of the single-transit find at BTJD 3073.205 (S65), with a claimed repeat at 3906.22 (S95)

Analysis run 2026-11-02 on public data only: MAST light curves (TESS-SPOC 200-s FFI for S61–69, QLP for 38 sectors S2–S98, TARS for S64–66 and S94–95), TESScut for S65 and S95, Gaia DR3 (including the NSS tables), the TIC 8.2, SIMBAD (CfA mirror), the AAVSO VSX API, and read-only ExoFOP pages and TOI/CTOI lists. Nothing was submitted anywhere.

## Verdict: **not a planet candidate.** The dip is the light-curve minimum of a known binary blended with the target. The "second transit" is a QLP detrending artifact.

**The target is a visual double, and the fainter star is a 2.37-day spectroscopic binary.**
* TIC 177239679 is SIMBAD's **CD-71 380** (type `**`). The TIC marks it `SPLIT`.
* Gaia resolves two stars **2.35″ apart** with the same parallax (3.295 vs 3.259 mas) and proper motion (Δμ = 1.2 mas/yr, i.e. 1.7 km/s). They form a physical pair about 710 au apart.
  * A: Gaia DR3 5267268245941081472, G 10.78.
  * B: Gaia DR3 5267268250236345600, G 11.10, TIC 764904125.
* **Star B is a Gaia DR3 SB1**:
  * P = **2.374198 ± 0.000057 d**, K = 57.4 ± 1.0 km/s, e = 0.072.
  * f(M) = 0.046 M☉, so M₂ ≥ 0.51 M☉ and a ≈ 8.9 R☉ ≈ 6 R_B.
  * Gaia's RV time series has `rv_amplitude_robust` 111 km/s and `rv_chisq_pvalue` 0. SIMBAD lists B as `SB*`.
* B supplies about **42% of the light in every TESS aperture** (T ≈ 10.38 for A and 10.74 for B, 0.11 px apart).

**The TESS light curve contains that binary's orbital modulation, and the "transit" is one of its minima.**
* The Lomb–Scargle periodograms of TESS-SPOC SAP (S61–69) and QLP SAP (all sectors) both peak at **2.3689 / 2.37438 d**, which is Gaia's SB1 period. They also show its first harmonic (1.187 d) and an unrelated 4.42 d signal, probably rotation of one of the two stars.
* Folded on the Gaia orbit, the light curve has a ~1.8 ppt (peak to peak) modulation. Its **minimum falls at the Gaia-predicted conjunction**, where the SB1's companion is in front, within the 0.12 d propagated uncertainty.
* **The S65 event sits at that conjunction.** The Gaia orbit predicts BTJD 3073.097 ± 0.117 and the event is at 3073.205: phase +0.046, a 0.9σ offset. The vet's "pulsations" at 57.7, 57.3 and 28.5 h are this orbital signal and its harmonic.
* **Once the 2.374 d and 4.42 d signals are modelled, nothing unusual remains.**
  * The 8 h depth falls from 1.1–3.5 ppt (local baseline, depending on window) to **0.39 ± 0.19 ppt** in TESS-SPOC SAP, 0.44 ± 0.32 in QLP SAP, 0.42 ± 0.24 in TARS and 0.36–0.43 ± 0.2 in our own TESScut photometry.
  * An injected 8 h dip is recovered at 94% by the same procedure, so the model does not absorb a transit.
  * Over all 43,605 8-h box positions in 38 sectors of residuals, the TC1 box has SNR 1.0. **17% of all boxes are at least as significant**, and 16 residual dips are stronger than it.
  * Among the 78 conjunctions in S61–69, TC1's raw trough ranks 5th. Its residual (0.61 ppt, 2.3σ against a scatter of 0.27) is the largest, which is the expected size of the largest of 78 red-noise draws. The sweep picked the deepest trough in the data set.
* **The shape is the trough, not a transit.** Fitted at face value, the feature is a broad V lasting **23–27 h**, not 8 h. Its implied density, 0.003–0.012 ρ☉, is 1–6% of star A's 0.22 ρ☉ (Gaia FLAME). An eclipse in B's 8.9 R☉ orbit would last at most ~4 h, so the trough cannot be an eclipse either.

**The S95 "repeat" at 3906.22 is an artifact.**
* Only QLP's detrended flux (`DET_FLUX`) shows it: 2.95 ± 0.23 ppt.
* It does not appear in QLP SAP (−0.10 ± 0.94), QLP `SYS_RM_FLUX` (+0.23 ± 0.90), TARS (−0.20 ± 0.71) or our TESScut photometry (−0.16 ± 0.70, r = 1.8 px).
* It sits at the end of orbit 2, where QLP flags 63 cadences (bit 30) within ±0.5 d and the QLP background is 15,000 e⁻/s and rising (r(flux, background) = −0.42). It also falls at SB1 phase −0.09, on the descending side of the next orbital trough.
* The 833 d "period" is therefore meaningless.

**Confidence:** high (>95%) that this is not a transiting planet. A shallow (≤0.4 ppt of pair light, ≤0.7 ppt on star A) 8 h transit hidden at TC1 cannot be ruled out. Nothing requires one: TC1 sits at the same residual level as hundreds of other epochs.

## Status of each step

| # | Step | Status |
|---|---|---|
| 1 | Host parameters: TIC 8.2, Gaia DR3 for both stars (astrometry, RUWE, IPD, NSS, RV, FLAME/GSP-Phot) | **verified**: physical 2.35″ pair; B is an SB1 with P = 2.3742 d |
| 2 | Depth in TESS-SPOC SAP/PDCSAP, QLP SAP/DET/SYS_RM, TARS, own TESScut (3 apertures × 2 backgrounds), raw and after the harmonic model; injection | **verified**: the depth disappears once the SB1 modulation is modelled. S95 appears only in QLP `DET_FLUX` |
| 2b | Periodogram and fold on the Gaia orbit | **verified**: photometric period = Gaia period; the minimum is at conjunction |
| 3 | Quality flags, momentum dumps, gaps, scattered light, jitter, background, 20 same-CCD stars | **verified**: S65 is clean (no flags, no dump within 1 d, jitter 0.9–1.4×). S95 is in a flagged, high-background stretch. No common-mode dip on other stars (median 0.04 ppt, 0 of 20 >3σ) |
| 4 | Per-pixel image and Gaia neighbours | **run**: the event has SNR 1.0 in the joint per-pixel fit, so it cannot be localised. The SB1 signal's centroid is on the pair (+1.7″). A and B are 0.11 px apart and cannot be separated by TESS |
| 5 | All-sector residual search, repeats, allowed periods | **run**: TC1 is not significant (17% of boxes deeper); no repeat; the period analysis is moot |
| 6 | batman fit, implied ρ★ | **run**: a 23–27 h V shape with ρ★ 1–6% of catalog; it does not fit an 8 h transit |
| 7 | ExoFOP / TOI / CTOI / VSX / SIMBAD | **run**: no TOI, CTOI, imaging or spectra. VSX is empty. SIMBAD has CD-71 380 A and B (SB*). VizieR was unreachable on every mirror |

## 1. The stars

| | A: Gaia DR3 5267268245941081472 (TIC 177239679) | B: Gaia DR3 5267268250236345600 (TIC 764904125) |
|---|---|---|
| Separation from A | – | **2.35″** at position angle 169° |
| G / BP−RP / T (est.) | 10.78 / 0.755 / 10.38 | 11.10 / 0.692 / 10.74 |
| Parallax [mas] | 3.295 ± 0.010 | 3.259 ± 0.013 |
| μ [mas/yr] | (−15.09, +13.28) | (−15.47, +14.39) |
| M_G | 3.37 | 3.67 |
| RUWE / IPD multi-peak / harmonic amplitude | 0.95 / 4% / 0.025 | 0.91 / 4% / 0.022 |
| non_single_star | 0 | **2 (SB1)** |
| Gaia RV | none | 5.0 ± 10.5 km/s, robust amplitude **111 km/s**, χ² p = 0 |
| FLAME R / M / age | 1.74 R☉ / 1.15 M☉ / 6.2 Gyr (ρ 0.22 ρ☉) | 1.48 R☉ / 1.18 M☉ / 4.8 Gyr (ρ 0.36 ρ☉) |
| GSP-Phot Teff / logg / [M/H] | 6157 K / 4.10 / −0.37 | 6028 K / 4.15 / −0.96 |

* **TIC 8.2.** Teff 6312 K, d 304 pc, no radius or mass, disposition `SPLIT`. The duplicate is TIC 764904123. SPOC CROWDSAP is 0.563.
* **B's SB1 orbit (nss_two_body_orbit):** P 2.3741981 ± 0.0000571 d, T_peri = 2016.0 − 0.871 ± 0.098 d, e 0.072 ± 0.013, ω 133 ± 15°, K 57.41 ± 0.96 km/s, γ 9.4 km/s, significance 60.
* **Gaia multi-peak flag.** The automated vet's "Gaia multi-peak" flag (4%) is the resolved B itself. Both stars show the same 4%.

## 2. The event in every reduction (S65, camera 4 CCD 2)

8 h trapezoid at the fixed epoch. "Raw" uses a local polynomial baseline: ±1 d quadratic, or ±0.75 d linear, or ±1.5 d quadratic. "Resid" uses the same fit after dividing by the per-sector harmonic model, fitted with ±0.4 d masked: 2.374 d × 3 harmonics, 4.42 d × 2, and a quadratic per orbit. All depths are in ppt of the product's own flux.

| Product | Raw (3 baselines) | β (red noise) | Resid (±1 d quadratic) | frac_deeper of resid |
|---|---|---|---|---|
| TESS-SPOC SAP | 1.09 / 1.97 / 1.91 ± 0.35–0.62 | 3.8–5.5 | **0.39 ± 0.19** | 0.04 |
| TESS-SPOC PDCSAP (crowding-corrected) | 1.94 / 3.52 / 3.41 ± 0.65–1.05 | 3.8–5.5 | 0.87 ± 0.32 | 0.02 |
| QLP SAP | 1.91 / 3.53 / 3.40 ± 0.6–1.1 | 3.8–5.5 | 0.44 ± 0.32 | 0.05 |
| QLP SYS_RM_FLUX | 1.92 / 3.55 / 3.42 | | 0.56 ± 0.31 | 0.02 |
| QLP DET_FLUX (QLP's own detrending) | −0.00 / −0.01 / −0.02 ± 0.15 | 1.0 | −0.10 ± 0.15 | 0.76 |
| TARS | 1.17 / 2.03 / 1.98 ± 0.4–0.66 | 2.1–3.9 | 0.42 ± 0.24 | 0.03 |
| Own TESScut, r = 1.0 / 1.8 / 3.0 px, global background | 1.12 / 1.11 / 1.06 ± 0.4 | | 0.42 / 0.43 / 0.36 ± 0.32 / 0.23 / 0.19 | 0.03–0.08 |
| Own TESScut, annulus background | 1.10 / 1.08 / 0.99 | | 0.40 / 0.39 / 0.27 | 0.03–0.08 |

* **The raw depth tracks the baseline window.** That is why the vet saw ">30% change with detrending" and "pipelines disagree": QLP's spline removes the trough entirely.
* **Injection.** An 8 h, 0.6–1.4 ppt trapezoid injected at 31 other S65 epochs is recovered at 94% ± 0.1% by the harmonic-model procedure.
* **Aperture behaviour.** The depth does not depend on aperture (r 1–3 px), and the SB1 amplitude is flat too (2.2–2.6 ppt peak to peak). Both are expected for a signal from the unresolved pair.
* **Figures:** `figs/raw_windows.png`, `figs/s65_harmonic_model.png`, `figs/own_phot.png`.

**Event 2 (S95, 3906.223):**

| Product | Depth [ppt] |
|---|---|
| QLP `DET_FLUX` | 2.95 ± 0.23 |
| QLP SAP | −0.10 ± 0.94 |
| QLP `SYS_RM_FLUX` | 0.23 ± 0.90 |
| TARS | −0.20 ± 0.71 |
| Own TESScut | −0.77 to +0.29 (± 0.7) |
| Any product, after the harmonic model | −0.24 to +0.31 |

## 2b. The 2.374 d signal is the Gaia SB1 (`figs/sb1_periodogram_phase.png`)

* **Periodograms.**
  * TESS-SPOC SAP S61–69: highest peak 4.42 d (power 0.20), then **2.36886 d** (0.16).
  * QLP SAP over all 38 sectors (about 2700 d baseline): 4.41 d, then **2.37438 d**, then 1.18713 d (= P/2).
  * Gaia's period is 2.37420 d. The difference is well inside the periodogram resolution (about 0.002 d).
* **Fold on the Gaia ephemeris.** Peak-to-peak amplitude is ~1.8 ppt of pair light, i.e. ~4 ppt intrinsic to B. There is one deep minimum per orbit at the conjunction with B's companion in front, a weak secondary minimum near phase 0.5, and maxima near ±0.35. This looks like reflection or irradiation of the ≥0.51 M☉ companion plus ellipsoidal variation (expected ~2 ppt for q ≈ 0.43 and a/R ≈ 6).
* **Where the two events fall.** In the 78 TESS-SPOC conjunctions, the raw 8 h trough depth has median 0.58 ppt, 90th percentile 1.0 and maximum 1.41 ppt (S63 3023.24). TC1 is 1.17 ppt, rank 5. At the opposite conjunction the raw median is 0.18 ppt. TC1 is at phase +0.046 and TC2 at −0.091.

## 3. Systematics

| Item | S65 (TC1) | S95 (TC2) |
|---|---|---|
| Flagged cadences within ±0.5 d | none (TESS-SPOC, QLP) | 63 QLP cadences flagged bit 30 |
| Momentum dumps | none within 1 d (nearest 3076.18) | none within 1 d (nearest 3901.31) |
| Nearest gap edge | 2.76 d | 1.33 d. The q = 0 data end at about 3906.6, at the end of orbit 2 |
| Background | TESS-SPOC 1149 e⁻/s, in − out −0.5. r(flux, background) = 0.00 | QLP 15,115 e⁻/s, in − out **+56**. r = −0.42 |
| Jitter in/out, x / y | 0.94 / 1.42 (TESS-SPOC MOM_CENTR) | 1.21 / 1.55 (QLP) |
| Centroid shift | 0.05 / 0.08 mpx | 3.8 / 4.5 mpx |
| Other stars | 20 TESS-SPOC S65 stars on camera 4 CCD 2 within 18′: median 0.04 ppt, 0 of 20 >3σ | – |

## 4. Per-pixel image and neighbours (`figs/diffimage_s65.png`)

* **Joint per-pixel fit.** Each pixel was fitted jointly for the event, the SB1 harmonics, the 4.42 d harmonics and the per-orbit baselines.
  * The event amplitude inside r = 1.8 px is 0.62 ppt at **SNR 1.0**, so there is nothing to localise.
  * The SB1 amplitude image is centred +1.7″, +0.2″ from star A, i.e. on the pair. The 4.42 d image is centred +0.7″, −2.3″.
  * A and B are 0.114 px apart, so TESS cannot tell which one varies. Gaia can: the orbit belongs to B.
* **Eclipse depth each neighbour would need.** Two cases: the vet's 1.37 ppt on A, and the post-model residual (0.4 ppt of pair light, which is 0.7 ppt on A).

  | Source | Sep | G | Needed (vet depth) | Needed (residual) |
  |---|---|---|---|---|
  | A (target) | – | 10.78 | 0.14% | 0.07% |
  | **B (SB1)** | 2.35″ | 11.10 | 0.19% | 0.10% |
  | Gaia …906176 | 21″ | 15.75 | 12% | 6% |
  | Gaia …907072 | 33″ | 16.11 | 12% | 6% |
  | Gaia …164992 | 34″ | 14.45 | 3.2% | 1.6% |
  | Gaia …445824 | 28″ | 18.68 | 97% | 49% |
  | All others within 1′ (G > 18.9) | | | impossible | |

* **Conclusion.** Only A and B are plausible hosts of any real dip. B is already known to vary by about 4 ppt on the 2.374 d orbit.

## 5. All sectors (`figs/all_sectors_resid.png`, `data/step5_search.json`)

* **Data and method.** 47 sector light curves: TESS-SPOC SAP for S61–69, QLP SAP for the other 29 sectors. Each was divided by its own harmonic model and then searched with an 8 h box on a 0.02 d grid.
* **Noise level.** The median 8 h box σ is 0.51 ppt (TESS-SPOC) and 0.94 ppt (QLP). This is red: imperfect modelling of the evolving modulation.
* **TC1 and TC2.** TC1 has SNR 1.0 (0.53 ppt), and 17% of all boxes are at least as significant. TC2 has SNR −0.4.
* **Strongest residual dips.** S97 3953.98 (8.4 ppt, SNR 5.1), S94 3880.63 (SNR 4.4) and S98 4010.14 (SNR 3.9) are all QLP, in noisy late sectors. S65 3089.93 (1.75 ppt, SNR 3.2) is at SB1 phase 0.09. None repeats.
* **No secondary eclipse or odd/even test:** there is no periodic transit signal.
* **Allowed periods.** For a 0.80 ppt (pair light), 8 h dip, only 6% of the covered time excludes it at 3σ. Allowed fractions: 2% of 5–30 d, 36% of 30–100 d, 75% of 100–300 d and ≥92% beyond 300 d. The residual noise is too high for this to constrain anything, and it would only matter if the dip were real.

## 6. Face-value fit (`figs/fit_s65.png`, `data/step6_fit.json`)

* **Setup.** batman, circular orbit, TESS-SPOC SAP 200 s, quadratic limb darkening (0.24, 0.30), P fixed at 833 d or 100 d. Free parameters: tc, k, b, ρ★.
* **Local quadratic baseline.** The fit is a V of depth 2.3 ppt and **T14 25–27 h**, grazing (b 0.96–1.25). ρ★ = 0.003–0.012 ρ☉, against 0.22 for A and 0.36 for B. Forcing A's density costs Δχ² = 70–180 (white noise; β ≈ 4–5).
* **Harmonic baseline over the whole sector.** The fit is a 0.76–0.92 ppt V with T14 22–23 h, centred at 3073.07–3073.08, which is the Gaia conjunction (3073.097).
* **Interpretation.** The feature is a day-wide extra depression of the orbital trough, not an 8 h transit. White-noise ΔBIC values (90–300) mean nothing here: the same red noise gives comparable "detections" at 17% of epochs (§5).

## 7. Prior knowledge

* **ExoFOP:** no TOIs, CTOIs, imaging, spectroscopy, time series or stellar companions. Names: CD-71 380 / TYC 9182-00398-1. Neither TIC 177239679 nor TIC 764904125 is in the TOI list (8152 lines) or the CTOI list (5140 lines).
* **AAVSO VSX** (3′): no objects.
* **SIMBAD** (CfA mirror): CD-71 380 `**`, CD-71 380A `*`, CD-71 380B **`SB*`** (1 reference).
* **VizieR** (VSX, the TESS EB catalogue, WDS) timed out or returned 502 on the CfA, CDS, IUCAA and NAO mirrors.

## What would change the verdict

Only a dip that repeats **off conjunction**, or one far deeper than the orbital-trough scatter (more than ~1.5 ppt in pair light after modelling), would reopen this. If someone still wants to test a hidden shallow transit on A, two things would do it:

1. Seeing-limited ground photometry that resolves the 2.35″ pair, e.g. a 1 m telescope in good seeing, or speckle photometry.
2. RVs of A alone.

Neither is worth requesting on the present evidence.

## Not checked

* VizieR catalogues (all mirrors were down). VSX was checked via the AAVSO API instead.
* SPOC 2-min data: none exist for this star.
* GSFC-ELEANOR-LITE and TGLC: only 2018–2019 sectors, which do not cover either event.
* Which of A or B produces the 4.42 d signal.
* A full GP model of the evolving modulation. The fixed-harmonic model leaves about 0.5 ppt of red noise per 8 h.

## Pipeline note

1. **Check Gaia DR3 NSS for every source in the aperture, not only the target.** A 2.37 d SB1 with K = 57 km/s 2.3″ away explains both the variability and the dip.
2. **When a resolved, comoving Gaia neighbour shares the aperture:**
   * fold the light curve on any NSS period;
   * reject a single event that falls within ±0.1 phase of that orbit's light-curve minimum unless it is much deeper than the cycle-to-cycle trough scatter.
3. **The "pulsation removal" check should test whether the removed periods match a known binary period.** Here 57.7 h ≈ 2.40 d and 28.5 h ≈ P/2. Any event must be re-measured with those signals fitted jointly over the whole sector, not just subtracted.
4. **Treat a QLP-`DET_FLUX`-only event at an orbit edge as an artifact** unless QLP SAP or another pipeline shows it. The S95 "recovery" was exactly that.

## Files

Run the scripts with `../.venv/bin/python -W ignore <script>` from this folder.

* **Helpers:** `lcio.py`, `measure.py`, `common.py` (Gaia SB1 ephemeris and harmonic model).
* **Scripts:** `step1_products.py`, `step1_tic.py`, `step1_gaia.py`, `step1_gaia_nss.py`, `step1_download.py`, `step1_tesscut.py`, `step2_look.py`, `step2_sb1.py`, `step2_archival.py`, `step2_model.py`, `step2_own_phot.py`, `step3_flags.py`, `step3_neighbors.py`, `step4_diffimage.py`, `step5_search.py`, `step6_fit.py`, `step7_catalogs.py`, `step7b_vizier.py`.
* **Figures (`figs/`):** `raw_windows.png`, `sb1_periodogram_phase.png`, `s65_harmonic_model.png`, `conjunction_depths.png`, `own_phot.png`, `diffimage_s65.png`, `all_sectors_resid.png`, `fit_s65.png`.
* **Data (`data/`):** `tic.json`, `tic_60arcsec.csv`, `gaia_pair.json`, `gaia_nss_companion.json`, `gaia_3arcmin.csv`, `step2_*.json`, `step3_*.json`, `step4_diffimage.json`, `step5_search.json`, `step6_fit.json`, `step7*.json`, plus the downloaded FITS files (`lc/`, `lc_neighbor/`, `tesscut/`).
