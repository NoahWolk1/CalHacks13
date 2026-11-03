# TIC 382041558: follow-up of the single-transit find at BTJD 2367.159 (S39)

Analysis run 2026-11-02. It uses public data only: MAST light curves (TESS-SPOC for 20 sectors S2–S39, QLP for 42 sectors S2–S98, the TARS HLSP for S36–39, and GSFC-ELEANOR-LITE and TGLC, which cover only S2–S13), a TESScut 21×21 cutout for S39 (and S38), TIC 8.2, Gaia DR3 (ESA archive: gaia_source, astrophysical_parameters, vari_*, nss_*), SIMBAD (CfA mirror), the AAVSO VSX API, and the ExoFOP target page and TOI/CTOI lists, read only. Nothing was submitted anywhere. No SPOC 2-min data exist for this star.

## Verdict: **not a planet candidate: the dip is not a 4 ppt transit of the target.** The light lost in the event comes from about 1.5 px from the target, toward the G = 15.9 neighbour 32″ away, inside an interval that TESS-SPOC flags for scattered light. It is best classed as a **blend or systematic**: either a 1.5–5% eclipse of that neighbour, or scattered-light structure. The data favour the neighbour at only about 3σ

1. **Only QLP sees 4–5 ppt.** QLP SAP and KSPSAP give 4.8 ± 1.0 ppt. Reductions that measure the target itself see a third of that:
   * TESS-SPOC SAP gives **1.49 ± 0.59 ppt**. All its event cadences carry flag 4096 (scattered-light exclude), so PDCSAP is NaN there; that flag is why the vet reported "no data".
   * TARS gives **1.26 ± 0.79 ppt**.
   * Our own TESScut photometry at r = 1 px gives **1.2 ± 0.8 ppt**.
2. **The depth grows with aperture size, which an on-target dip does not do.** Our TESScut photometry with a plane background gives 1.37 / 2.38 / 3.97 / 4.21 / 4.68 ppt at r = 1 / 1.5 / 2 / 2.5 / 3 px. The other background estimators show the same pattern. In absolute terms, most of the missing light (about 1.2 → 6 e⁻/s) comes from pixels 1–2 px from the target, not from its core.
3. **The difference image puts the missing light off the target.** I fit a Gaussian PSF at a free position (plus a flat term) to the per-pixel depth image.
   * The best position is **1.55 px from the target** and 0.75 px from Gaia DR3 4761328283954529792 (G 15.86, 32″). It has an amplitude of only 2.1 e⁻/s.
   * Placing the source on the target costs **Δχ² = 7.9**; placing it on the neighbour costs 1.6.
   * **Injection test.** A 3.96 ppt on-target dip injected at three event-free epochs is recovered **within 0.1–0.14 px of the target**, at the expected 4.3–5.4 e⁻/s.
   * The target's peak pixel shows 0.42 ± 0.25 e⁻/s, where an on-target 3.96 ppt dip predicts 1.22.
4. **Photometry centred on the neighbour shows a dip; photometry centred on the target barely does.**
   * Neighbour-centred r = 1 px: deficit **1.76 ± 0.49 e⁻/s** (5.2 ppt of that aperture); 0.4% of slid boxes are deeper.
   * Target-centred r = 1 px: 1.34 ± 0.66 e⁻/s (1.4 ppt); 6% of slid boxes are deeper.
   * At 62 star-free control spots in the cutout, the same box gives 0.07 ± 0.49 e⁻/s, and none reaches 1.76.
5. **Features of this size are routine in QLP.** Across 42 QLP sectors, at or above the event's search S/N (4.7) there are 9 dips and **17 brightenings**. At depth ≥ 4.8 ppt there are 8 dips and 13 brightenings. The event ranks 9th of 96 QLP dips. TESS-SPOC PDCSAP never shows any 6 h feature ≥ 3 ppt in 20 sectors; a real 4 ppt on-target transit would stand out there.

**Confidence.** High (>95%) that this is not a ~4 ppt transit of TIC 382041558: the injection, the PSF fit and three independent target-centred reductions all show this. That the source is specifically the G 15.9 neighbour is supported only at about 3σ (Δχ² 7.9; neighbour aperture 3.6σ). A scattered-light artifact is not excluded.

## Status of each step

| # | Step | Status |
|---|---|---|
| 1 | Host: TIC 8.2, Gaia DR3 (astrometry, RUWE, IPD, RV, NSS, GSP-Phot/FLAME/MSC, variability) for the target and the neighbours within 2′; SIMBAD | **verified**: K dwarf at 329 pc, RUWE 5.0 and a two-star MSC solution (likely an unresolved binary); no NSS solution for the target or any neighbour |
| 2 | Depth in TESS-SPOC SAP/PDCSAP, QLP SAP/KSPSAP, TARS, own TESScut (5 apertures × 4 backgrounds); re-centred tc and duration | **verified**: QLP 4.8 ppt; target-centred reductions 1.2–1.5 ppt; ELEANOR and TGLC don't cover S39 |
| 3 | Flags, dumps, gaps, scattered light, background, centroids/jitter, other stars in the cutout | **verified**: the event sits at the end of a TESS-SPOC scattered-light (4096) interval (2364.49–2367.35); no dump, gap or jitter during it; 7 cutout stars show no common-mode dip |
| 4 | Location: difference image, free-position PSF fit, injection, neighbour/target/control apertures, depths each neighbour would need | **verified**: off-target (1.55 px), toward the G 15.86 neighbour |
| 5 | All sectors: box search (QLP 42, TESS-SPOC 20), dips vs brightenings, periods allowed, rotation | **run**: no repeat; noise-level feature in QLP; P ≳ 292 d if real |
| 6 | Batman fit, ρ★ | **run**: not discriminating for a single event (§6) |
| 7 | ExoFOP, TOI, CTOI, VSX, SIMBAD | **verified**: no TOI/CTOI; VSX lists the star as ROT (Gaia); not in SIMBAD within 15″. VizieR unreachable |

---

## 1. The host (`data/step1_tic_products.txt`, `data/step1_gaia.txt`, `data/gaia_2arcmin.csv`)

| Quantity | Value |
|---|---|
| Names | 2MASS J05152253-5951374, UCAC4 151-005353, WISE J051522.53-595137.2, Gaia DR3 4761328283954531328 |
| TIC 8.2 | Tmag 12.62, Teff 4914 K, logg 4.34, R 1.01 R☉, M 0.81 M☉, d 343 pc, contamination 0.034 |
| Gaia DR3 | G 13.21, BP−RP 1.15, ϖ 3.040 ± 0.045 mas, **RUWE 5.03**, ipd_frac_multi_peak 1, harmonic amplitude 0.020, non_single_star 0, RV 30.6 ± 1.5 km/s (22 transits) |
| GSP-Phot / FLAME | Teff 4879 K, logg 4.40, [M/H] −0.31, R 0.99 R☉, L 0.51 L☉; spectral type (ESP-HS) K |
| MSC (two-star fit) | Teff 5139 K + 4343 K, d 339 pc |
| M_G | about 5.5 (A_G 0.11). Together with R ≈ 1 R☉ at 4900 K, which is large for a K dwarf, RUWE 5 and the two-star MSC solution, this points to an unresolved binary. I did not fit the CMD quantitatively |
| Gaia variability | vari_summary: G std 6.7 mmag over 39 epochs; classifier SOLAR_LIKE (score 0.39); no rotation-modulation, EB or NSS entry |
| LMC? | No: RA 78.8°, Dec −59.9° is outside the LMC box, and ϖ = 3.04 mas |

**Neighbours.** No neighbour has an NSS solution. For each, the depth it would need to make 3.96 ppt by itself is 3.96 ppt × 10^(0.4 ΔG):

| Gaia DR3 | Sep | G | BP−RP | ϖ [mas] | RUWE | Needed depth |
|---|---|---|---|---|---|---|
| 4761328283954529792 | 31.7″ | 15.86 | 1.08 | 1.09 | 1.01 | **4.6%** (1.5–5% from the pixel analysis, §4) |
| 4761328627551915264 | 57.5″ | 16.92 | 1.12 | 0.72 | 0.98 | 12% |
| 4761328387033743744 | 74.1″ | 16.24 | 1.04 | 0.82 | 0.97 | 6.5% |
| 4761328421393482752 | 72.9″ | 17.18 | 0.76 | 0.35 | 0.96 | 15% |
| others within 2′ | | ≥ 18.1 | | | | ≥ 35% |

The G 15.86 neighbour has M_G ≈ 6.0 at about 920 pc and GSP-Phot Teff 4965 K, so it is also a K dwarf.

## 2. Depths (`data/step2_archival.json`, `data/step2_flagged.json`, `data/step2_own_phot.json`)

**Method.** I fit a 6 h trapezoid plus a quadratic baseline for each data segment within ±1 d (`measure.py`). The error is max(σ_white·β, σ_emp).

| Product (S39) | Depth [ppt] |
|---|---|
| QLP SAP / KSPSAP | 4.82 ± 1.01 / 4.80 ± 1.01 (re-centred: tc 2367.154, 9.8 h, 5.1 ppt) |
| QLP SAP with QLP's SAP_BKG as a regressor | 4.89 ± 0.82 (flux–background r = −0.03) |
| TESS-SPOC SAP, flag 4096 ignored | **1.49 ± 0.59** (frac_deeper 0.03) |
| TESS-SPOC PDCSAP | no data (NaN for the whole 4096 interval) |
| TARS (rotation HLSP) | **1.26 ± 0.79** (re-centred: 2.2 ppt, S/N 2.8) |
| Own TESScut, plane background, r = 1 / 1.5 / 2 / 2.5 / 3 px | **1.37 ± 0.67** / 2.38 ± 0.68 / 3.97 ± 0.90 / 4.21 ± 1.14 / 4.68 ± 1.65 |
| Own, global faint-pixel background | 1.21 / 2.14 / 3.59 / 3.69 / 3.96 |
| Own, annulus 25th-percentile background | 1.75 / 2.95 / 4.87 / 5.44 / 6.42 |

QLP's background estimate swings from +6000 to −3500 over ±2.5 d, going negative around the event, whereas TESS-SPOC's aperture background falls smoothly (1850 → 1650 e⁻/s). QLP's background model is therefore unreliable here, but its flux does not track it linearly. The QLP depth matches what our own large apertures give, so I attribute the QLP depth to its aperture including off-target pixels (§4), not to its background.

## 3. Systematics (`data/step3_flags.json`, `data/step3_comps.json`, `figs/step2_flagged_bkg.png`)

* **Scattered light.** TESS-SPOC flags 2364.489–2367.350 with bit 4096, and the event (2367.03–2367.28) is in the last 0.3 d of that interval. Our own background is 333 e⁻/s/px during the event, against a sector median of 164.
* **Momentum dumps.** QLP bit 32 at 2367.63 and TESS-SPOC at 2368.30–2368.32, both after the event. The SAP step at about 2368.4 follows the 2368.3 dump; it is not the event.
* **Gaps.** The orbit gap is at 2374.85–2375.86, far away.
* **Centroids and jitter.** In TESS-SPOC, the centroid shift during the event is 0.06 ± 0.20 mpx (column) and −0.43 ± 0.26 mpx (row), and the in/out jitter ratio is 0.98. No sign of a pointing problem.
* **Other stars in the cutout** (7 stars, r = 1 px): +1.23 ± 1.21, +0.45 ± 0.74, +2.8 ± 1.9, +0.42 ± 0.61, +0.67 ± 2.2 ppt and two faint ones, all consistent with zero. No strong common-mode dip. I did not check stars on the same CCD outside the cutout.
* **Star-free rings around the target** (deficit per pixel): −0.06 ± 0.05 (3–5 px), −0.06 ± 0.04 (5–8 px). The sky does not drop in the event, so a simple background over-subtraction does not explain the aperture growth.

## 4. Location (`data/step4_locate.json`, `data/step4_posfit.json`, `data/step4_nbr_phot.json`, `figs/step4_diffimage_s39.png`, `figs/step4_posfit.png`)

* **PSF fit to the median image.** Gaussian σ = 0.70 px. The fitted fluxes are 1219 e⁻/s for the target and 148 e⁻/s for the G 15.86 neighbour, which is 1.54 px from the target.
* **Free-position fit to the per-pixel depth image.**
  * Best position: 1.55 px from the target, 0.75 px from the neighbour; amplitude 2.09 e⁻/s; χ² 66.1 for 49 px.
  * Δχ² for the target position = **7.9**; for the neighbour position = 1.6.
* **Fixed-template fits.**
  * Target: 2.40 ± 0.59 e⁻/s, which is **1.97 ± 0.48 ppt of the target**. That is 4σ below 3.96 ppt.
  * Neighbour: 2.45 ± 0.49 e⁻/s, which is **1.65 ± 0.33% of the neighbour**. Its χ² is lower by 8.4.
* **Injection.** A 3.96 ppt on-target dip injected at 2366.36, 2370.16 and 2372.16 is recovered 0.10–0.14 px from the target, at 4.3–5.4 e⁻/s. Added to the real event, it moves the fit onto the target with amplitude 6.7 ≈ 2.1 + 4.8 e⁻/s.
* **Aperture photometry.**
  * Neighbour-centred r = 0.8 / 1.0 / 1.5 px: deficit 1.15 ± 0.45 / **1.76 ± 0.49** / 2.64 ± 0.62 e⁻/s.
  * Target-centred: 1.21 ± 0.55 / 1.34 ± 0.66 / 2.34 ± 0.75 e⁻/s.
  * The 62 control spots give 0.07 ± 0.49 e⁻/s (95th percentile 0.65), and none reaches 1.76.
* **If the neighbour is the source,** the deficit (2.1 e⁻/s from the PSF fit to about 5 e⁻/s in large apertures) against its 106–148 e⁻/s means an eclipse of about **1.5–5%** lasting about 6–10 h.

## 5. All sectors (`data/step5_search.json`, `data/step5_count.json`, `data/step5_periods.json`)

* **Box search.** A 6 h box was slid every 0.04 d over every sector (QLP SAP binned to 10 min; TESS-SPOC PDCSAP; TESS-SPOC SAP with 4096 allowed), keeping local extrema of both signs.

| Product | |S/N| ≥ 4 | ≥ 4.7 | ≥ 5 | ≥ 6 | depth ≥ 4.8 ppt |
|---|---|---|---|---|---|
| QLP SAP (42 sectors), dips / brightenings | 20 / 30 | **9 / 17** | 6 / 15 | 2 / 11 | 8 / 13 |
| TESS-SPOC PDCSAP (20), dips / brightenings | 2 / 4 | 0 / 1 | 0 / 0 | 0 / 0 | 0 / 0 |
| TESS-SPOC SAP (20), dips / brightenings | 22 / 13 | 9 / 4 | 8 / 2 | 2 / 1 | 3 / 3 |

* The event is QLP dip number 9 of 96 by S/N (4.86 ppt, S/N 4.7). The deepest QLP dips are at 2987.67 (S61), 3195.39 (S69) and 3000.56 (S62).
* No TESS-SPOC PDCSAP feature ever reaches 3 ppt; the largest is 2.0 ppt. There is no repeat of any depth that stands out.
* **Periods still allowed** for a real 6 h event (another epoch must have less than 70% coverage in QLP or TESS-SPOC): every P < 292 d is excluded. The allowed fractions are 0.1% of 100–300 d, 16% of 300–1000 d and 82% of 1000–2700 d, in agreement with the vet's P ≳ 293 d.
* **Rotation and variability.** TESS-SPOC PDCSAP periodograms give 0.3–2.5 ppt peaks at 3.6–11.7 d that change from sector to sector (VSX: ROT). This slow variation is absorbed by the ±1 d quadratic baseline, and no 6 h variability is seen.
* **Secondary eclipses and odd/even.** Not meaningful for a single off-target event.

## 6. Shape and stellar density (`data/step6_fit.json`)

Face-value batman fits (circular orbit, quadratic u = 0.50, 0.20):

| Data | P fixed | Depth | b | T14 | ρ★ implied |
|---|---|---|---|---|---|
| QLP SAP | 617 d | 4.47 ppt | 0.00 | 10.5 h | 3.9 ρ☉ |
| QLP SAP | 100 d | 4.50 ppt | 0.16 | 10.5 h | 0.60 ρ☉ |
| Own r = 2 px | 617 d | 3.74 ppt | 0.02 | 10.2 h | 4.1 ρ☉ |
| Own r = 2 px | 100 d | 3.74 ppt | 0.05 | 10.2 h | 0.66 ρ☉ |

The star's density is ρ★ ≈ 0.82 ρ☉. A central transit would last 5.6 / 9.0 / 16.5 / 20.8 h at P = 24 / 100 / 617 / 1240 d. With a single event, ρ★ trades off against P, so the shape cannot discriminate. A 10 h duration fits P of about 100–600 d at moderate b. The verdict rests on §4.

## 7. Catalogs (`data/step7_catalogs.txt`, `data/exofop.json`)

* **ExoFOP.** No TOI, CTOI, confirmed planet, imaging or spectroscopy. Contamination 0.034.
* **TOI and CTOI lists.** The star is in neither (8152 and 5140 lines).
* **AAVSO VSX API.** Gaia DR3 4761328283954531328, type **ROT**, 13.19–13.22 G, spectral type K (discoverer: the Gaia collaboration).
* **SIMBAD (CfA).** No object within 15″.
* **VizieR.** Unreachable (CfA 502, CDS and IUCAA timed out), so the VizieR copy of VSX, the TESS EB catalog (Prša+2022) and the Gaia classifier table there were not queried. The Gaia vari_*, NSS and EB tables were queried at ESA and have no EB or NSS entry.

## What would change the verdict

* A target-centred reduction showing about 4 ppt. Today's best numbers are 1.5 ± 0.6 (TESS-SPOC SAP), 1.3 ± 0.8 (TARS) and 1.4 ± 0.7 ppt (own r = 1 px).
* A difference-image fit that lands on the target, which happens for injected on-target dips but not for this event.
* Even then, at about 1.5 ppt and S/N of about 2.5 the event would be below any candidate threshold.
* To confirm or exclude the neighbour, look for 1.5–5% eclipses of Gaia DR3 4761328283954529792 (G 15.86, 32″ SW) in seeing-limited photometry. With no period, that is only practical if a TESS repeat appears. No observation is recommended now.

## Not checked

* Stars on the same CCD outside the 21×21 cutout (only 7 cutout stars were tested).
* A full PRF model; I used a Gaussian PSF with σ = 0.70 px. The localisation Δχ² (7.9) depends on that model.
* The neighbour's own light curve in other sectors, which might show more eclipses.
* A quantitative CMD binary fit for the host (RUWE 5.0, MSC two-star solution).
* VizieR catalogues (all mirrors down).
* TGLC and ELEANOR for S39 (they cover only S2–S13).

## Pipeline note

1. **Don't drop a sector because of TESS-SPOC flag 4096.** The vet reported "no data" for S39, but TESS-SPOC SAP is present, only flagged as scattered light. Measure SAP with 4096 allowed, and report that the event sits in a flagged interval.
2. **Run the aperture-growth and free-position localisation on FFI cutouts, with an injection control.** Here the depth rose from 1.4 to 4.7 ppt between r = 1 and 3 px, and the deficit centred 1.55 px off-target. An injected on-target dip came back on the target.
3. **Use the dips-against-brightenings count per product.** In QLP for this star, brightenings outnumber dips at the event's S/N (17 against 9). TESS-SPOC PDCSAP, which is quieter, never shows any feature of 3 ppt or more.
4. **Check RUWE and MSC for unresolved binarity before quoting a planet radius.** Here RUWE is 5.0 and the MSC fit gives 5139 K + 4343 K.

## Files

Scripts: `common.py`, `lcio.py`, `measure.py`, `step1_tic.py`, `step1_products.py`, `step1_gaia.py`, `step1_download.py`, `step2_archival.py`, `step2_flagged.py`, `step2_own_phot.py`, `step3_comps.py`, `step3_flags.py`, `step4_locate.py`, `step4_posfit.py`, `step4_nbr_phot.py`, `step5_search.py`, `step5_count.py`, `step5_periods.py`, `step6_fit.py`, `step7_catalogs.py`. Run them with `../.venv/bin/python -W ignore` from this folder.

Data (`data/`): `step1_tic_products.txt`, `step1_gaia.txt`, `gaia_2arcmin.csv`, `step1_download.log`, `step2_archival.json`, `step2_flagged.json`, `step2_own_phot.json`, `step3_comps.json`, `step3_flags.json`, `step4_locate.json`, `step4_posfit.json`, `step4_nbr_phot.json`, `step5_search.json`, `step5_count.json`, `step5_periods.json`, `step6_fit.json`, `step7_catalogs.txt`, `exofop.json`. The downloads are in `lc/`, `hlsp/` and `tesscut/`.

Figures (`figs/`): `step2_window_s39.png`, `step2_flagged_bkg.png`, `step2_own_phot_s39.png`, `step4_diffimage_s39.png`, `step4_posfit.png`.
