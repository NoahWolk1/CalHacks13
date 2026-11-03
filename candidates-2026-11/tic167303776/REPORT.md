# TIC 167303776 (2MASS J06320799−6810419 = "2M0632"): follow-up of the single-transit find (BTJD 1456.31)

Analysis run 2026-11-02. It uses public data only: MAST (SPOC 2-min light curves for 37 sectors S2–S98, TESS-SPOC, QLP, and the S5 TGLC, TASOC, ELEANOR-lite and TARS HLSPs; the S5 SPOC target pixel file; 15 other S5 2-min light curves on camera 4 CCD 4), TIC 8.2, Gaia DR3 (ESA archive), SIMBAD (CfA mirror), the AAVSO VSX API, ExoFOP (target JSON, TOI and CTOI lists, read only) and the arXiv API (abstract lookup). Nothing was submitted anywhere.

## Verdict: **stellar variability.** The event is one of hundreds of dimming events of a known "dipper": a young (Carina association) M dwarf with a circumstellar disk. It is not a transit or an eclipse

* **The dip is not single.** Across 37 SPOC 2-min sectors (832 d of data), the same 3.6 h box finds:

  | Event-sized events (3.6 h box) | Dips | Brightenings |
  |---|---|---|
  | ≥ 70 ppt (half the event's depth) | **253** | 6 |
  | ≥ 140 ppt (the event's depth) | **64** | **0** |

  * The event ranks **64th**. The deepest dip is 41% (S90, 30-min bins).
  * In 30-min bins there are 543 dips deeper than 5%, about 0.65 a day. Every sector, every camera-4 CCD and every year shows them.
* **The dips are locked to the star's 1.86 d period.**
  * Lomb–Scargle on the SAP flux gives **P = 1.8627 d** with power 0.15. It is stable from 1.8612 to 1.8644 d in each TESS year, 2018–2025.
  * Of the ≥ 70 ppt dips, **67% fall within ±0.15 in phase** of the event, where 30% would be expected by chance (Rayleigh R = 0.62).
  * Per sector, the dip phases are concentrated with p down to 4×10⁻⁷.
  * The dips are stochastic in depth and occurrence but phased with rotation. That is the signature of dust occulting the star near the corotation radius.
* **The dip is on the target.**
  * The S5 per-pixel deficit is **11.3–14.9% of each aperture pixel's flux**, so it has the target's point-spread-function (PSF) shape.
  * Its centroid is 2.6″ from the Gaia position and 2.8″ from the median-image centroid.
  * A regression of every pixel on all the sector's dips gives the same location (1.8″).
  * No Gaia star within 24″ is brighter than G 17.5. The nearest stars that could matter (24–40″) would need 87–158% eclipses.
* **This star is already published as a dipper.** SIMBAD lists **UCAC4 110-012461** as type **Em\***, a member of the **Carina Association** (membership 86) and Carina-Extended (100). Its references include:
  * Tajiri+2020 and Capistrant+2022 (TESS dipper catalogues).
  * **Gaidos+2022, MNRAS 514, 1386: "PAST II: an M dwarf 'dipper' star with a long-lived disk in the TESS CVZ".** From the abstract (not re-derived here): "2M0632, an M dwarf member of the Carina young moving group … > 300 dimming events, each lasting a few hours, and as deep as 40% … correlated with a distinct, stable 1.86-day periodic signal … a T Tauri-like accretion disk … age 40–60 Myr."
  * My independent numbers match that description.
* **The host is a young M dwarf.**
  * M_G 10.67 at BP−RP 3.06. Gaia ESP-ELS gives Hα in emission (EW −0.67 Å) and ESP-HS gives type M. Flares are visible in the light curve.
  * Gaia RV 7.3 ± 4.9 km/s is too uncertain to test group membership by itself. At RV ≈ 17 km/s (+2σ) the UVW lands within 3–4 km/s of Tuc-Hor, Columba and Carina.
* **The vet's ephemeris is an alias of the dip forest.**
  * Its P = 247.71 d "transits" are other dips: 1463.03 is a 96 ppt dip at rotation phase 0.62, and epoch 7 (3190.27) is a 97 ppt dip.
  * With 0.30 dips per day at ≥ 70 ppt, any predicted time has a 6% chance of a dip within ±0.1 d.

## Status of each step

| # | Step | Status |
|---|---|---|
| 1 | Host: TIC 8.2, Gaia DR3 (astrometry, binarity, NSS, variability, AP tables), neighbour NSS, kinematics, SIMBAD | **verified**: single (RUWE 1.16, ipd 0, NSS 0) young M dwarf with Hα emission; SIMBAD Carina member; known dipper |
| 2 | Depth in SPOC SAP/PDCSAP, TESS-SPOC, TGLC, TASOC, ELEANOR-lite, TARS, own TPF pixels; re-centred | **verified**: 130–190 ppt in every reduction (QLP doesn't cover S5) |
| 3 | Flags, dumps, gaps, background, jitter, 15 same-CCD stars | **verified**: clean; no common-mode dip |
| 4 | Location: per-pixel deficit, all-dips pixel regression, required depths for Gaia neighbours | **verified**: on target |
| 5 | All sectors: dip and brightening census, rotation phasing, the vet's P = 247.7 d | **verified**: 253 dips ≥ 70 ppt vs 6 brightenings; dips phased with P_rot |
| 6 | batman fit, density, symmetry | **run**: a face-value fit is possible (ρ 1.65× catalog) but meaningless given step 5 |
| 7 | ExoFOP, TOI, CTOI, VSX, SIMBAD, literature | **run**: no TOI/CTOI/VSX; SIMBAD and the literature identify it as a published dipper. VizieR is unreachable |

---

## 1. Host star (`data/tic.json`, `data/step1_gaia.json`, `data/step1_gaia_nss.json`, `data/step1_kinematics.json`, `data/gaia_2arcmin.csv`)

| Quantity | Value |
|---|---|
| Names | 2MASS J06320799−6810419, UCAC4 110-012461, WISEA J063207.99−681041.6, Gaia DR3 5280226578890455168 |
| TIC 8.2 | Tmag 14.15, Teff 3149 K, R 0.354 R☉, M 0.339 M☉, ρ 7.64 ρ☉, d 93.4 pc, contamination ratio 0.026; on the cooldwarfs list (2-min target in 37 sectors) |
| Gaia DR3 astrometry | ϖ 10.747 ± 0.027 mas, μ (9.35, 33.94) mas/yr, RUWE 1.16, astrometric excess noise 0.13 mas (sig 2.5), ipd_gof_harmonic_amplitude 0.028, ipd_frac_multi_peak 0, non_single_star 0 |
| Gaia photometry | G 15.52, BP−RP 3.06, **M_G 10.67**. That is plausibly above the field main sequence for this colour, consistent with a pre-main-sequence star (not quantified against isochrones here) |
| Gaia AP | GSP-Phot Teff 3309 K, R 0.42 R☉ (A_G 0.62, unphysical at 93 pc); MSC Teff 3120–3160 K; ESP-HS type M; **ESP-ELS Hα EW −0.67 ± 0.09 Å (emission)**; DSC binary probability 0.0006 |
| Gaia tables | no entry in nss_two_body_orbit, nss_acceleration_astro, nss_non_linear_spectro, vari_summary, vari_classifier_result, vari_eclipsing_binary, vari_rotation_modulation or vari_short_timescale. No epoch photometry |
| Gaia RV | 7.29 ± 4.90 km/s (13 transits); no rv_chisq_pvalue or amplitude published (too faint) |
| UVW (Gaia RV) | (−12.9, −11.1, +1.9) km/s; at RV = 17.1 km/s (+2σ) it is (−11.6, −19.8, −2.6), 2.7 / 3.5 / 3.8 km/s from the mean UVW of Tuc-Hor / Columba / Carina. Not decisive by itself |
| SIMBAD | otype Em*; parents **Carina Association** (membership 86) and **Carina-Extended Association** (100). Eight references, including three dipper papers and a moving-group census |

**Neighbours with Gaia NSS orbits:**
* G 10.97 at 111″ (Gaia DR3 5280227575322856448): AstroSpectroSB1, P 399 d.
* G 14.44 at 83″ (Gaia DR3 5280226613250205312): Orbital, P 639 d.

Both lie 4–5 px from the target, outside the deficit images. A several-hundred-day orbit can't make 0.3 dips a day.

## 2. Depths (`data/step2_archival.json`, `data/step2_all.json`, `figs/step2_look_s5.png`, `figs/step2_all_spoc.png`)

`measure.py`: a trapezoid on a ±0.75 d quadratic baseline, quality = 0 only, with tc and duration re-fitted on a grid. Best tc = 1456.293–1456.298 and T ≈ 3.6 h in every product (the vet used 4 h at 1456.31).

| Product (S5) | Depth at vet tc/4 h [ppt] | Re-centred 3.6 h [ppt] | Minimum [ppt] |
|---|---|---|---|
| SPOC SAP / PDCSAP (2-min) | 134 / 153 | **141 ± 13 / 161 ± 15** | 207 / 234 |
| TESS-SPOC SAP / PDCSAP (30-min) | 134 / 159 | 144 ± 12 / 171 ± 15 | 187 / 222 |
| TGLC PSF / cal PSF / aperture / cal aperture | 139 / 145 / 172 / 177 | 148 / 153 / 186 / 189 (± 13–16) | 192–247 |
| TASOC FFI and 2-min raw | 136 / 139 | 147 / 146 ± 13 | 193 / 223 |
| ELEANOR-lite raw / corr / PCA | 130 / 128 / 131 | 141 / 129 / 142 ± 13 | 172–175 |
| TARS | 144 | 152 ± 13 | 188 |
| Own TPF pixels (SPOC aperture, 3.6 h box) | | 140 | |

* The TASOC FLUX_CORR columns are in different units and give nonsense values; they are ignored.
* The TGLC PSF photometry deblends the target from its neighbours and still shows 148–153 ppt.
* The pipelines agree. The differences come from their crowding corrections (CROWDSAP 0.81–0.92 across sectors).

## 3. Systematics (`data/step3_flags.json`, `data/step3_neighbors.json`)

* **Quality flags.** None within ±0.3 d. Momentum dumps are at 1454.59 and 1457.59, 1.7 d and 1.3 d away. No gap within 2 d.
* **Background.** Changes by −0.5 e⁻/s against 340 e⁻/s (the target gives 267 e⁻/s in SAP).
* **Pointing.**
  * POS_CORR1/2 shift by 0.13 / 0.61 mpx and MOM_CENTR1/2 by −2.9 / −4.7 mpx.
  * Jitter in/out ratios are 0.86–1.44.
  * The small centroid shift is what a 14% on-target dip does to a flux-weighted centroid with 12% contaminating light. It matches the vet's "1.1″".
* **15 other SPOC S5 2-min stars on camera 4 CCD 4** (T 7.3–13.7, 3.8–27′ away): box depths −0.44 to +0.49 ppt, all within 2σ. The largest |depth| is 3.1 ± 1.75 ppt. No common-mode dip.
* **Not instrumental.** The dips occur on all four camera-4 CCDs over seven years at the star's own period. That rules out an instrumental cause.

## 4. Location (`data/step4_pixels.json`, `figs/step4_pixels.png`)

* **S5 SPOC TPF event deficit** (3.6 h box against a ±0.5 d linear baseline per pixel):
  * It peaks on the target's pixels.
  * In every aperture pixel the deficit is 0.113–0.149 of that pixel's flux (median 0.142), so the dip has the target's PSF shape.
  * Gaussian-fit centroid: 2.55 ± 0.23″ from the Gaia position, 2.8″ from the median-image centroid (0.13 px). That is about WCS/PSF-model accuracy.
* **All-dips regression** (each pixel regressed on the sector's dip signal): centroid 1.8″ from the target, the same pixels.
* **Eclipse depth each Gaia neighbour would need**, relative to the target's flux and ignoring the further loss from its PSF falling outside the aperture:
  * T 16.9 at 24″: 158%. T 16.3 at 36″: 87%. T 16.4 at 40″: 96%.
  * T 15.1–15.9 at 61–68″: 29–60%. T 14.0 at 83″: 11%. T 10.65 at 111″: < 1%.
  * The stars beyond 60″ (≥ 3 px) sit where the deficit image is zero, so they are ruled out by pixels.
  * The nearest Gaia sources (8–15″) are G 18.7–20.9 and can't make a 14% dip.

## 5. All sectors (`data/step3_variability.json`, `data/step3_river.json`, `data/step5_search.json`, `figs/step3_river.png`, `figs/step5_dips.png`)

* **Rotation.** Lomb–Scargle on 30-min SAP gives P = 1.8627 d (power 0.15), first harmonic 0.931 d. Dip-masked: 1.8626 d. Per year: 1.8636, 1.8644, 1.8612 and 1.8619 d. This is the vet's "variability 1.87 d, 32 ppt".
* **Census.** SAP in 10-min bins, normalised by a ±1 d running median; 3.6 h box every 0.02 d:
  * The event is 140 ppt.
  * Dips ≥ 70 ppt: 253; brightenings ≥ 70 ppt: 6.
  * Dips ≥ 140 ppt: 64; brightenings: 0.
  * The event ranks 64th of 253.
  * That dips outnumber brightenings 64:0 shows the dips aren't noise. Their number shows they aren't a transit.
  * The 6 brightenings weren't characterised individually. The light curve shows large flares, for example at S5 1441.8 and 1450.0.
* **Phasing.**
  * All 543 dips deeper than 5% (30-min bins): Rayleigh R = 0.55.
  * Dips ≥ 70 ppt: R = 0.62, with 67% within ±0.15 phase of the event.
  * Per-sector concentration p ranges from 0.6 (S2, S5) to 4×10⁻⁷ (S63). The mean phase drifts within about ±0.15 over seven years.
  * The river plot shows dips coming and going from cycle to cycle at nearly fixed phase.
* **The vet's P = 247.71 d.**
  * Epoch 7 (3190.27) contains a 97 ppt dip. The vet's third "transit" (S87 QLP) falls in a sector without SPOC 2-min data. Its "1463.03 repeat" is a 96 ppt dip at rotation phase 0.62.
  * With 0.30 dips ≥ 70 ppt per day, a dip lands within ±0.1 d of any given time 6% of the time. A three-dip "ephemeris" through hundreds of dips is expected by chance.
  * Odd/even, secondary and alias tests are moot.

## 6. Shape (`data/step6_fit.json`, `figs/step6_fit.png`)

**Face-value batman fit** (S5 SPOC SAP, ±0.6 d quadratic baseline, circular, P fixed at the vet's 247.7 d):

| Quantity | Value |
|---|---|
| Fitted parameters | k 0.53, b 0.84, depth 177 ppt, T14 6.3 h |
| Implied stellar density | **ρ★ 12.6 ρ☉, 1.65× the catalogue value**; forcing the catalogue density costs Δχ² = 67 |
| Implied companion size | 20.5 R⊕ |
| Symmetry | the two halves are equal (98 vs 96 ppt), but the profile has a long, rounded ingress and egress (`figs/step6_fit.png`) |

A single event can be fitted this way. It means nothing next to the 253 other dips.

**Consistency with corotating dust:**
* The corotation radius at 1.8627 d is 12.6 R★.
* A point occultor there would cross the star in 1.1 h at most.
* A 3.6 h dip therefore needs material spread along about 6 R★ of arc. That is consistent with clumpy dust structures rather than a solid body.

## 7. Catalogs (`data/step7_catalogs.json`, `data/step7_catalogs2.json`, `data/step7_catalogs3.json`)

* **ExoFOP.** No TOI, CTOI, imaging, spectroscopy or companions. Not in the TOI list (8152 lines) or the CTOI list (5140 lines).
* **AAVSO VSX API, 3′.** No entries.
* **SIMBAD.** UCAC4 110-012461: Em* (from 2025A&A...699A.145D), member of the Carina Association and Carina-Extended. Its references:
  * 2020ApJS..251...18T (dippers from TESS FFIs, year 1)
  * 2022ApJS..263...14C (TESS dipper population)
  * **2022MNRAS.514.1386G** (Gaidos+, PAST II: this star, dipper with a long-lived disk)
  * 2021MNRAS.508.3084S (infrared excess of Gaia M dwarfs)
  * 2022MNRAS.511.6179L and 2024AJ....168..159L (young moving-group members)
  * 2025A&A...699A.145D (accretion rates from Gaia XP)
  * 2021AJ....161..233K (TESS habitable-zone catalogue)
* **VizieR.** The CfA mirror returned 502; CDS and IUCAA timed out. VizieR VSX, the TESS EB catalogue and WDS were not queried.

## What would change the verdict

Nothing realistic. The event is one of hundreds of rotation-phased, variable-depth dips on a published dipper.
* A transiting companion would show strictly periodic dips of the same depth. No such sequence appears in 832 d.
* A hidden planet transit under the dips can't be excluded or tested with this data, and this event isn't evidence for one.

## Not checked

* The WISE W3/W4 infrared excess and the multi-band dip colours. These are from the literature only, via the Gaidos+2022 abstract; I read only the abstract, not the paper.
* BANYAN Σ membership. Only a manual UVW comparison was done (§1).
* QLP, TESS-SPOC and HLSP products outside S5. The census in §5 uses SPOC 2-min SAP only.
* The 6 brightenings ≥ 70 ppt, and flares in general.
* VizieR catalogues (all mirrors unreachable).

## Pipeline note

1. **Count event-sized dips before calling a find "single".**
   * The recovery check found "the 150 ppt transit 55 more times" and then fitted a period through three of them.
   * When dozens of dips of the event's depth exist and same-size brightenings don't (here 64:0), the star is a dipper or eclipser, not a transit host. Such finds should be relabelled, not vetted as periodic.
2. **Use SIMBAD otype and references in the "Already catalogued" check.** VSX had nothing, but SIMBAD gives Em*, Carina membership and three dipper papers, one of them about this exact star.
3. **Treat young-star indicators as a red flag.** These include SIMBAD association membership, Hα emission (Gaia ESP-ELS), over-luminosity in M_G, and a P < 2 d rotation of tens of ppt.
4. **Prewhitening cannot clean a dipper.** The vet removed 51–64 "pulsation" sinusoids, which partly fit the dips (the depth fell from 140 to 123 ppt), and the uniqueness check then found a dip at phase 0.73 "nearly as strong". Both are symptoms of the dip forest.

## Files

Run every script with `../.venv/bin/python -W ignore <script>` from this folder.

**Scripts:**
* Shared modules: `lcio.py` (extended for T16/TGLC/TASOC files), `measure.py`
* Step 1: `step1_tic.py`, `step1_products.py`, `step1_download.py`, `step1_gaia.py`, `step1_gaia_nss.py`, `step1_kinematics.py`
* Step 2: `step2_look.py`, `step2_all.py`, `step2_archival.py`
* Step 3: `step3_variability.py`, `step3_river.py`, `step3_flags.py`, `step3_neighbors.py`
* Step 4: `step4_pixels.py`
* Steps 5–7: `step5_search.py`, `step6_fit.py`, `step7_catalogs.py`, `step7_catalogs2.py`, `step7_catalogs3.py`

**Figures (`figs/`):** `step2_look_s5.png`, `step2_all_spoc.png`, `step3_river.png`, `step4_pixels.png`, `step5_dips.png`, `step6_fit.png`

**Data (`data/`):**
* Star and neighbours: `tic.json`, `tic_120arcsec.csv`, `step1_tic.txt`, `step1_products.txt`, `step1_gaia.json`, `step1_gaia.txt`, `step1_gaia_nss.json`, `step1_kinematics.json`, `gaia_2arcmin.csv`
* Depths and variability: `step2_archival.json`, `step2_all.json`, `step3_variability.json`, `step3_river.json`
* Systematics and pixels: `step3_flags.json`, `step3_neighbors.json`, `step4_pixels.json`
* Search, fit and catalogs: `step5_search.json`, `step6_fit.json`, `step7_catalogs.json` (with `step7_catalogs.txt`), `step7_catalogs2.json`, `step7_catalogs3.json`
* Arrays: `sap30.npy`, `dips.npy`
* Downloads: light curves in `lc/` and `lc_neighbor/`, target pixel file in `tpf/`
