# TIC 277173662 (2MASS J05364651-6929561, O8.5 II in HMW 2): follow-up of the single-transit find (BTJD 1405.656)

Analysis run 2026-11-02. It uses public data only:
* MAST: 38 SPOC 2-min sectors S1–98, 30 TESS-SPOC, 37 QLP, the eleanor-lite S3 HLSP, the S2/S3/S97 2-min TPFs, and 15 other S3 2-min light curves within 20′.
* Gaia DR3 (ESA archive), SIMBAD (CfA mirror), the AAVSO VSX API, and ExoFOP (read only).

Nothing was submitted anywhere.

## Verdict: **noise/systematic artifact in a light curve dominated by LMC supergiants.** The dip is a 2.5σ, 1.7 ppt fluctuation in the light of a blend where the target contributes only about 4–5%. It ranks 56th–101st among about 1750 comparable dips, with as many brightenings of the same size. It is not a planet in any interpretation

**The host is not a dwarf, and the aperture light is mostly not the host.**

| Evidence | Value |
|---|---|
| Target | SIMBAD 2MASS J05364651-6929561, **O8.5 II**, in the cluster HMW 2 (about 30 SIMBAD stars within 10″) |
| Gaia DR3 astrometry | ϖ −0.076 ± 0.027 mas, μ (1.56, 0.52) mas/yr: the LMC |
| Gaia temperature | GSP-Phot 32.8 kK; ESP-HS type O |
| Luminosity and size | M_G ≈ −5.8, log L ≈ 5.47, **R ≈ 17 R☉**, M ≈ 30 M☉ |
| Aperture light (S3 PSF model of Gaia sources) | **HD 269859 = LMC V3604 (B1Ia, Gaia ACYG, G 10.83, 5.4″): 37%**. **R127 = LMC V3600 (the S Dor LBV, G 10.70, 16.9″): 31%**. A G 12.19 star at 19.9″: 7%. **Target: 4.3%**. SPOC CROWDSAP is 0.050–0.063 in every sector |
| TIC 8.2 (wrong) | Tmag 12.16 ± 0.6 (G is 13.18), d 11.1 kpc from a negative DR2 parallax, no Teff, R or M, disposition SPLIT |

The vet's "known: LMC V3604 (SDOR:)" refers to HD 269859, 5.4″ away, not to the target.

**Five findings decide it:**

1. **The dip is 1.7 ppt of the aperture light, at 2.5σ.**
   * SPOC SAP shows 1.71 ± 0.67 ppt and TESS-SPOC SAP 1.57 ± 0.65 ppt. eleanor-lite shows 1.63 ± 0.83 (raw) and 1.76 ± 0.84 (PCA).
   * The "25.6–39 ppt" in PDCSAP is that number divided by CROWDSAP ≈ 0.054. PDCSAP S3 gives 39.1 ± 15.8 ppt (β 3.8).
2. **The star field makes dips this size all the time.** The sweep statistic (6 h box on a ±1 d quadratic baseline) was slid over all 38 SPOC sectors.

   | Product | Event rank among dips | Brightenings at least as large |
   |---|---|---|
   | SAP | 56 of 1748 | 52 |
   | PDCSAP | 75 of 1750 | 64 |
   | TESS-SPOC PDCSAP | 101 of 1266 | 93 |

   Equal rates of dips and brightenings mean noise. In PDCSAP, the 90th and 99th percentiles of 6 h dip depths are 30 and 65 ppt.
3. **The vet's "repeat" is not there.** At BTJD 3946.77 (S97), SPOC PDCSAP gives 8.4 ± 7.9 ppt and SAP 0.42 ± 0.51 ppt. The point sits 0.09 d before a 2.6 d data gap, and QLP S97 is a scattered-light ramp there. The vet's P = 2541 d and its alias list are therefore void.
4. **The dip is not on the target.**
   * HD 269859 has its own SPOC 2-min light curve (TIC 277173650, CROWDSAP 0.44). It shows **the same 1.75 ± 0.66 ppt SAP dip** at the same time. Its pixels overlap the target's, so this is one aperture-level fluctuation assigned to two TICs.
   * A PSF fit to the S3 per-pixel deficit puts **54 ± 15 e⁻/s at R127** and **−3.8 ± 6.0 e⁻/s at the target/HD 269859 position**. A 32 ppt dip of the target would need 34 e⁻/s there. This test uses an approximate Gaussian PSF; the target and HD 269859 are only 0.26 px apart and cannot be separated in TESS.
   * The 14 other S3 2-min stars within 20′ show no matching dip, so it is not a common-mode systematic.
5. **Even a real eclipse of the target could not be a planet.**
   * 32 ppt on a 17 R☉ star needs a **3.0 R☉ (30 R_J) body**.
   * A central transit at P ≥ 10 d would last **≥ 24 h** (51 h at 100 d), not 6–11 h.
   * A free trapezoid fit (55 ppt, T14 11 h, V-shaped, ingress fraction 0.49) needs ρ★ 7× the star's at P = 10 d and 70× at P = 100 d.

## Status of each step

| # | Step | Status |
|---|---|---|
| 1 | Host: TIC, Gaia DR3 (astrometry, GSP-Phot, ESP-HS, NSS, variability of the target and of 181 neighbours with G < 17.2), SIMBAD, LMC membership | **verified**: O8.5 II LMC star, R ≈ 17 R☉. No NSS orbit for the target or any neighbour. ipd_frac_multi_peak 35% reflects the cluster |
| 2 | Depth in SPOC SAP/PDCSAP, TESS-SPOC, eleanor-lite; own TPF apertures | **verified**: 1.6–1.9 ppt of aperture light in every product and aperture (r 1–3 px). No QLP for S3. The T16 S3 download was corrupt |
| 3 | Flags, dumps, background, jitter, same-CCD stars, Gaia EBs | **verified**: no systematic explains it. Background regression leaves 1.64 ppt, so the vet's "background" flag is not reproduced |
| 4 | Location: per-pixel fit, HD 269859's own light curve | **verified**: the dip is shared with HD 269859's light curve, and the fit favours R127. It is not on the target |
| 5 | All sectors: repeats, dips vs brightenings | **verified**: no repeat; dips and brightenings occur at equal rates |
| 6 | Shape, size, density | **run**: a 3 R☉ body; the duration is far too short for this host |
| 7 | ExoFOP / TOI / CTOI / VSX / SIMBAD | **verified**: nothing on the target. VSX lists HD 269859 (LMC V3604, SDOR:) and R127 (LMC V3600, SDOR). VizieR and OGLE were not queried |

---

## 1. Host star (`data/tic.json`, `data/step1_gaia.txt`, `data/step1_gaia_nbr.txt`, `data/step6_size.json`)

| Quantity | Value |
|---|---|
| Names | 2MASS J05364651-6929561, Gaia DR3 4657655435693899904, TIC 277173662 |
| SIMBAD | spectral type O8.5II; U/B/V 12.05/12.53/12.49, I 13.12 |
| Gaia DR3 | G 13.183, BP−RP −0.22, ϖ −0.076 ± 0.027 mas, μ (1.557, 0.520) mas/yr, RUWE 1.01, ipd_frac_multi_peak 35, ipd_gof_harmonic_amplitude 0.030, NSS 0, no RV. No vari_* entry |
| Gaia GSP-Phot | 32.8 kK, logg 4.20, A_G 0.48, R 4.85 R☉ at its (wrong) 14.2 kpc, which is **17.0 R☉ at 49.6 kpc** |
| Derived (DM 18.477, BC −3.15) | M_G −5.77, log L 5.47, R 16.8 R☉. M ≈ 30 M☉ is adopted, giving ρ★ ≈ 0.006 ρ☉ and a contact period of 1.5 d |

**Neighbours.** The 181 Gaia sources with G < 17.2 within 2′ include:
* 8 within 4″ (ΔG 1.5–5.7). This is the cluster HMW 2.
* HD 269859: B1Ia, Gaia ACYG, VSX "LMC V3604, SDOR:", V 10.48–11.03, at 5.4″.
* R127: Ofpe/WN9 LBV, VSX "LMC V3600, SDOR", V 8.8–12.2, Gaia BE|GCAS|SDOR|WR, at 16.9″.
* 28 Gaia-classified variables within 2′ and 7 Gaia EBs at 26–106″.
* None has an NSS solution.

## 2. Depths (`data/step2_archival.json`, `data/step2_hlsp.json`, `figs/step2_windows.png`)

All values from `measure.py`: 6 h trapezoid, ±1 d per-segment quadratic baseline.

| Product, S3 | Depth | Notes |
|---|---|---|
| SPOC SAP | **1.71 ± 0.67 ppt** of the aperture | frac_deeper in-sector 0.012; /CROWDSAP 0.054 gives 31.8 ppt |
| SPOC PDCSAP | 39.1 ± 15.8 ppt | crowding-corrected; β 3.8 |
| TESS-SPOC SAP / PDCSAP | 1.57 ± 0.65 / 29.5 ± 11.8 ppt | |
| eleanor-lite RAW / CORR / PCA | 1.63 ± 0.83 / 2.39 ± 1.10 / 1.76 ± 0.84 ppt | |
| Own TPF photometry, r = 1 / 1.5 / 2 / 3 px | 1.89 ± 0.86 / 1.77 ± 0.75 / 1.75 ± 0.68 / 1.68 ± 0.62 ppt of each aperture | flat: the same light lost from every aperture size |

* **No QLP for S3.**
* **S97 "repeat" at 3946.77.** SPOC PDCSAP 8.4 ± 7.9 ppt; SAP 0.42 ± 0.51 ppt; QLP SAP 24 ± 16 ppt (coverage 0.54, on a scattered-light ramp); QLP DET 2.8 ± 44 ppt.
* **Detrending.** The vet's "detrending" and "pulsation" flags (43 → 22 ppt, SNR 9.8 → 3.3) are the same instability of a 2.5σ feature.

## 3. Systematics and the field (`data/step3_flags.json`, `data/step3_dipscan.json`, `data/step3_neighbors.json`, `data/step3_gaia_ebs.json`, `figs/step3_dipscan.png`)

* **Quality and timing.**
  * One cadence in the event is flagged (bit 128), and 99.4% have quality 0.
  * The last good S3 cadence is at 1406.214, 0.56 d after the event. After that, S3 is excluded (bit 128, 2289 cadences: the end-of-S3 attitude-control tests).
  * The nearest momentum dump is 0.94 d away (1404.71).
* **Background.**
  * SAP_BKG changes by 0.05 ppt of the SAP level during the event, and r(SAP, BKG) = −0.11 within ±1 d.
  * With SAP_BKG as a regressor the depth is 1.64 ppt, against 1.71 ppt without it.
  * The faintest 30% of the TPF pixels show 0.08 ± 0.16 e⁻/s per pixel.
  * The vet's "much of the dip goes with the background" is not reproduced.
* **Centroid.** The shift in minus out is below 0.003 px.
* **Dip scan** (all SPOC sectors, every 0.05 d, extrema at least 0.4 d apart):

  | Product | Event rank among dips | Brightenings at least as large | Dip-depth percentiles (50 / 90 / 99) |
  |---|---|---|---|
  | SAP | 56 / 1748 | 52 | 0.4 / 1.2 / 2.2 ppt |
  | PDCSAP | 75 / 1750 | 64 | 9.4 / 29.5 / 64.7 ppt |
  | TESS-SPOC PDCSAP | 101 / 1266 | 93 | 7.6 / 27.7 / 63.3 ppt |

  The deepest PDCSAP dips are 85–141 ppt. Dips and brightenings occur at the same rate, so the event is an ordinary fluctuation of this blend.
* **Same-time light curves** (14 other S3 SPOC 2-min stars within 20′):
  * All are consistent with zero except **TIC 277173650 = HD 269859**, which gives SAP 1.75 ± 0.66 ppt and PDCSAP 4.87 ± 1.93 ppt. That is the same pixels, not common-mode.
  * The largest of the others is 12.9 ± 7.5 ppt in PDCSAP (TIC 404797355).
* **Gaia EBs within 2′.** None can produce it: even the closest (G 17.6 at 26″, P 2.83 d) would need a depth above 100% in the aperture.

## 4. Location (`data/step4_pixels.json`, `figs/step4_pixels.png`)

* **PSF width.** A Gaussian PSF fit to the S3 median image gives σ = 0.64 px.
* **Positions in pixels.** Target (4.08, 4.86); HD 269859 (3.85, 4.98), 0.26 px from the target; R127 (3.89, 4.08), 0.8 px from the target.
* **Total deficit.** 42 ± 17 e⁻/s in the SPOC aperture, from per-pixel fits with a quadratic baseline. The scatter comes from 63 slid epochs.
* **Two-source fit of the deficit.** R127: 54 ± 15 e⁻/s. Target+HD 269859: −3.8 ± 6.0 e⁻/s. A 31.8 ppt dimming of the target alone would put **34 e⁻/s** there, which this fit disfavours.
* **Caveats.** The Gaussian PSF is only an approximation, and the deficit image also contains diffuse positive pixels. The localisation is therefore suggestive, not definitive.
* **Variability.** The variability-amplitude image is shared between the HD 269859 blend and R127.

## 5. All sectors

38 SPOC sectors (S1–98) were searched.
* **No repeat.** The vet's 3946.77 "repeat" is not significant (§2).
* **Moot.** Odd/even, secondary and period checks are moot: there is no periodic signal, and dips and brightenings of the event's size occur at equal rates (§3).
* **Variability modelling.** None was needed beyond this. The dip-scan distribution already includes the blend's variability (HD 269859 is an α Cyg variable and R127 is an LBV).

## 6. Shape and size (`data/step6_size.json`)

| Quantity | Value |
|---|---|
| Body for 25.6 / 31.9 / 39.1 ppt on 17 R☉ | 2.7 / 3.0 / 3.4 R☉ (27–33 R_J) |
| Central T14 at P = 10 / 30 / 100 / 635 / 2541 d | 24 / 34 / 51 / 94 / 149 h |
| Free trapezoid fit (SPOC PDCSAP S3, 20-min bins) | depth 55 ppt, T14 11.2 h, ingress fraction 0.49 (V-shaped), tc 1405.668 |
| Implied ρ★ for b = 0 | 0.043 / 0.43 / 10.9 ρ☉ at P = 10 / 100 / 2541 d: 7× / 70× / 1800× the host's 0.006 ρ☉ |

The fit's ΔBIC of 135 uses white 20-min scatter and ignores red noise (β 3.8), so it overstates the significance. The empirical significance is 2.5σ and rank 56–101 (§3).

## 7. Catalogs (`data/step7_catalogs.txt`, `data/vsx.json`, `data/exofop.json`)

* **ExoFOP.** No TOIs, CTOIs, imaging, spectroscopy or companions. The target is not in the TOI list (8152 lines) or the CTOI list (5140 lines).
* **SIMBAD (20″).** 53 objects. The target is O8.5II. HMW2003 cluster members within 9″ include O9.5III, O9.7II, B0III and O9Ib stars. HD 269859 (B1Ia, s*b) is at 5.4″.
* **VSX (72″).** LMC V3604 (SDOR:, B2Iae, V 10.48–11.03) at 5.4″; LMC V3600 = R127 (SDOR, Ofpe/WN9, V 8.8–12.2) at 16.9″; Gaia variables beyond 25″.
* **Not queried.** VizieR and the OGLE LMC catalogues were not queried for this star.

## What would change the verdict

Only a repeated, significant dip seen in an image that resolves the 5.4″ pair, for example seeing-limited photometry at 1″ resolving the target from HD 269859 and R127. Even then, the host's 17 R☉ radius rules out a planet: the body would be ≥ 3 R☉, and the transit would last ≥ 24 h.

## Pipeline notes

1. **Do not convert SAP dips through tiny CROWDSAP values.** When CROWDSAP < 0.2, report depth and significance in units of the aperture light, and rank them against that blend's own dip distribution. Here 1.7 ppt (2.5σ) became "25.6 ppt, SNR 8.9".
2. **Calibrate single events against brightenings in the same data.** Equal rates mean noise.
3. **Reject "repeats" within about 0.2 d of a data gap or orbit edge.**
4. **Check whether a neighbour has its own 2-min light curve with the same dip** (here HD 269859 = TIC 277173650).
5. **Name the star a VSX match belongs to, with its separation.** "LMC V3604" is HD 269859, not the target.
6. **Same as for TICs 389364321 and 404970655:** flag LMC giants with broken TIC entries (negative ϖ_DR2, e_Tmag 0.6, no radius) before vetting.

## Files

Scripts: `common.py`, `lcio.py`, `measure.py`, `step1_tic.py`, `step1_gaia.py`, `step1_gaia_nbr.py`, `step1_products.py`, `step1_download.py`, `step2_look.py`, `step2_archival.py`, `step2_hlsp.py`, `step3_dipscan.py`, `step3_flags.py`, `step3_neighbors.py`, `step3_gaia_ebs.py`, `step4_pixels.py`, `step6_size.py`, `step7_catalogs.py`. Run them with `../.venv/bin/python -W ignore` from this folder.

Data: `data/lc/`, `data/tpf/` (S2, S3, S97), `data/hlsp/`, `data/nbr/`, plus the JSON and text outputs named above.

Figures (`figs/`): `step2_windows.png`, `step3_dipscan.png`, `step4_pixels.png`.
