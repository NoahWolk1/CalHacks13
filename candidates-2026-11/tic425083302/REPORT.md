# TIC 425083302: follow-up of the single-eclipse find (BTJD 2131.268, S30 QLP)

Analysis run 2026-11-02. It uses public data only: MAST (QLP for 25 sectors S27–98, GSFC-ELEANOR-lite and TGLC for year 1, TESScut 25×25 for S30 and S89), TIC 8.2, Gaia DR3 (ESA archive), SIMBAD (CfA mirror), the AAVSO VSX API, the OGLE-IV Collection of Variable Stars (LMC eclipsing and ellipsoidal binaries, Glowacki+2025, read from the OGLE web server), and ExoFOP (target JSON plus the TOI and CTOI lists, read only). Nothing was submitted anywhere.

## Verdict: **eclipsing binary (blend).** The dip is one eclipse of an uncatalogued 18.66-day eclipsing binary on a neighbouring LMC B star 14″ away. It repeats 20 more times in TESS

**The "single eclipse" is periodic.** The sweep and the vet missed the repeats.
* Once the light of a second, known binary is masked (below), the event recurs every **P = 18.660 d** (T0 = BTJD 2131.254).
* There are **21 epochs with data in 17 sectors** (S27–S90). 19 of the 20 other epochs are ≥ 30 ppt deep in QLP SAP. Their weighted mean is **55.1 ± 0.8 ppt**; random 4 h boxes have a 99th percentile of 54 ppt.
* Folded, the eclipse is **V-shaped**: 73.6 ± 1.7 ppt in QLP SAP, T14 = 8.26 ± 0.13 h, ingress 3.56 ± 0.14 h (86% of the half-duration).
* The vet's "secondary eclipse" at BTJD 3736.06 is one of these eclipses (epoch 3736.014, S89).

**It is not on the target.** Two sectors give the same answer independently.

| | S30 (the event, 2131.25) | S89 (repeat, 3736.01) |
|---|---|---|
| Fitted PSF position of the deficit, distance to Gaia DR3 4660118479179211904 | **2.8″** (±0.9″ formal) | **2.7″** (±1.0″) |
| Distance to the target | 15.2″ | 12.5″ |
| Fixed-position fit: Δχ² of the next-best star | 693 (G 15.47 at 20.7″) | 667 (G 15.67 at 5.5″) |
| Fixed-position fit: Δχ² of the target | > 1650 (single-star χ² 2911 vs 952) | 1845 |
| Control: the 4.467-d EB's eclipses in the same images, distance to its own Gaia position | 1.1″ (primaries), 1.6″ (secondaries) | 2.1″ / 2.4″ |

* The eclipsing star is **Gaia DR3 4660118479179211904 = 2MASS J05321291−6740216**: G 14.25, BP−RP −0.36, GSP-Phot 25.5 kK, an LMC member (ϖ −0.012 ± 0.026 mas, μ (1.57, 0.46) mas/yr, RUWE 1.01).
* It needs a **26% eclipse** (32% from an aperture sum). That depth comes from the PSF-integrated deficit, calibrated on the 4.467-d EB: its primary comes out at 23.3% against OGLE's I-band 24.1%.
* It is in no OGLE-IV EB/ELL list, VSX or Gaia variability table. SIMBAD lists it only as a 2MASS source. It is a **new eclipsing binary**.

**A second, unrelated eclipsing binary dominates the target's light curve.**
* **OGLE-LMC-ECL-51276** (Gaia DR3 4660118479179218304, 9.8″ = 0.47 px from the target, G 14.63) has P = 4.4671 d, a 50 ppt primary and a 33 ppt secondary at phase 0.338 (eccentric) in QLP.
* The event falls at its phase 0.657, 37 h from any of its eclipses, so it is not this binary.
* This binary's eclipses (≈ every 1.5–3 d) are what the vet's "pulsation"/variability terms were fitting.

**A planet is excluded in every interpretation.** The target is also an LMC early-B star, about 8 R☉. Even if the dip were on the target, it would need a 50% eclipse, which means a body ≥ 5.7 R☉.

## Status of each step

| # | Step | Status |
|---|---|---|
| 1 | Host: TIC 8.2, Gaia DR3 (astrometry, RUWE, GSP-Phot, ESP-HS, NSS, vari) for the target and the neighbours, SIMBAD, LMC membership | **verified**: an LMC early-B star, R ≈ 8 R☉; TIC Tmag is wrong by ~2 mag. No NSS orbit for the target or any G < 17.5 star within 2′ |
| 2 | Depth in QLP SAP/KSPSAP/SML/LAG, own TESScut at 5 apertures × 2 backgrounds, re-centred | **verified**: present in every column. Own photometry is more diluted (the field has a large unresolved LMC background) |
| 3 | Quality flags, dumps, orbit edges, background, centroid, other stars in the cutout | **verified**: no systematic. It also repeats 20 times across 5 years |
| 4 | Localisation: per-pixel deficit + PSF fits in S30 and S89, depth each neighbour would need | **verified**: on Gaia DR3 4660118479179211904 (14.1″), not on the target; method checked on the known EB |
| 5 | All sectors: repeats, period, secondary, odd/even, dips vs brightenings | **verified**: P = 18.660 d, 21 epochs; odd/even agree (2.2σ); weak secondary candidate (3.9σ) at phase 0.706; 2P = 37.32 d not excluded |
| 6 | Shape | **run**: V-shaped, 8.3 h, a grazing stellar eclipse; a planet fit is moot because the host is wrong |
| 7 | ExoFOP / TOI / CTOI / VSX / SIMBAD / OGLE | **run**: no TOI, CTOI, imaging or spectra. VSX and OGLE list other EBs nearby, not this one. VizieR unreachable (CfA 502, CDS timeout) |

---

## 1. The host and its neighbours (`data/tic.json`, `data/step1_gaia.txt`, `data/gaia_3arcmin.csv`, `data/step7_catalogs.txt`)

| | Target: Gaia DR3 4660118479135990016 | Eclipser: Gaia DR3 4660118479179211904 | OGLE-LMC-ECL-51276: Gaia DR3 4660118479179218304 |
|---|---|---|---|
| Separation from target | – | 14.1″ (0.67 px) | 9.8″ (0.47 px) |
| G / BP−RP / T (est.) | 14.95 / −0.36 / 15.22 | 14.25 / −0.36 / 14.52 | 14.63 / −0.32 / 14.87 |
| ϖ [mas] | 0.060 ± 0.036 | −0.012 ± 0.026 | −0.047 ± 0.026 |
| μ [mas/yr] | (1.66, 0.56) | (1.57, 0.46) | (1.58, 0.44) |
| RUWE / AEN significance | **1.81** / 28.7 | 1.01 / 23.0 | 0.97 / 13.1 |
| GSP-Phot Teff / logg | 24.3 kK / 4.32 (ESP-HS type B) | 25.5 kK / 4.21 | 23.4 kK / 4.25 |
| Catalogued variability | none | none (not in OGLE, VSX, Gaia vari) | OGLE EB P 4.4668736 d, I depths 0.299/0.285 mag |

* **LMC membership.** All three stars have parallaxes consistent with zero (the LMC's is 0.020 mas) and the LMC proper motion. None has a Gaia RV. No SIMBAD RV exists for the target.
* **Target size.** Use DM 18.48 and A_G ≈ 0.2 (the observed BP−RP of −0.36 is about 0.1 mag redder than a 24 kK star's intrinsic colour). Then M_G ≈ −3.7, BC ≈ −2.4, log L ≈ 4.3 and **R ≈ 8 R☉**. GSP-Phot's 3.17 R☉ at its wrong 19.6 kpc rescales to 8.0 R☉ at 49.6 kpc. The target is an early-B giant/subgiant of about 12–15 M☉, not "a main-sequence dwarf".
* **The TIC is wrong.**
  * Tmag is 13.04 ± 0.6, but TGLC uses T = 15.22, and Gaia G 14.95 with BP−RP −0.36 gives T ≈ 15.2.
  * d = 6.3 kpc, and there is no Teff or radius.
  * The TIC also lists E(B−V) = 2.26, which is impossible for this blue star.
* **Target RUWE 1.81.** It is probably caused by the crowding: 2 Gaia sources lie within 3″, and the excess noise is high for most stars in this field. It is not needed to explain anything here.
* **SIMBAD (15″).**
  * Nothing at the target.
  * 1RXS J053216.5−674032 at 10.2″, a ROSAT X-ray source with a large error circle.
  * 2MASS J05321291−6740216 at 14.1″, which is the eclipser.
  * OGLE LMC-ECL-34861 at 14.3″. That is a different, fainter star: G 17.6, P 1.116 d, at phase 0.40 at the event.
* **OGLE-IV EBs within 2′** (`data/step7_ogle.json`). There are 13. Besides ECL-51276 and ECL-34861, the bright ones are ELL-04048 (41″, I 14.5) and ECL-34895 (53″, I 14.1, P 37.27 d), all at other phases. None matches 18.66 or 37.32 d.

## 2. Depths (`data/step2_archival.json`)

4 h trapezoid at 2131.268, ±1 d quadratic baseline, `measure.py`.

| Product (S30) | Depth [ppt] |
|---|---|
| QLP SAP_FLUX | 84.7 ± 14.0 (β 2.6) |
| QLP KSPSAP_FLUX / _SML / _LAG | 49.9 ± 5.1 / 44.1 ± 4.0 / 47.2 ± 6.8 |
| Re-centred on QLP SAP | t = 2131.273, 6.0 h, 81.8 ppt |
| Own TESScut, centred on target, r = 0.75 / 1 / 1.5 / 2 / 3 px (background-subtracted) | 16.1 / 14.6 / 13.8 / 9.6 / 5.2 ± 1.2–4.3 |
| Own TESScut, centred on the eclipser, r = 0.75 / 1 / 1.5 / 2 / 3 px (background-subtracted) | 21.1 / 20.2 / 13.8 / 11.8 / 7.0 ± 1.5–4.3 |

The dip is in every reduction.
* Our aperture depths are 3–5× smaller than QLP's. Our pixels include a large unresolved LMC background (≈ 200 e⁻/s per pixel in the faint-pixel median), and QLP's normalisation differs. QLP's flux scaling may depend on the wrong TIC Tmag, but this was not verified against the QLP code.
* The depth is larger in apertures centred on the eclipser than in the same apertures centred on the target, as expected if the eclipser is the source.
* No SPOC or TESS-SPOC light curve exists, because T ≈ 15.2.

## 3. Systematics (`data/step3_flags.json`, `figs/step3_flags.png`)

* **QLP flags.** 96% of event cadences have quality = 0 (one cadence has bit 4096).
* **TESScut.** No quality bits are set within ±1 d. The event is 1.06 d after the start of orbit 2 (2130.21).
* **Background.** The QLP background changes by +18 e⁻/s against an rms of 159. The TESScut faint-pixel background changes by −0.06 e⁻/s. r(flux, background) = −0.16.
* **Pointing.** The QLP centroid moves by 0.001–0.004 px, about the scatter.
* **Other stars.** Four other bright stars in the 25×25 cutout show nothing (SNR −1.0 to 0.7).
* **Repeats.** The eclipse repeats at the same period in 2020, 2021, 2023 and 2025, on three cameras/CCD positions (cam 4, CCDs 1–4). That excludes any one-off systematic.

## 4. Location (`step4_diffimage.py`, `step4_where.py`, `step4_psfphot.py`, `step4_depths.py`; `data/step4_*.json`; `figs/step4_diffimage.png`, `figs/step4_diffimage_s89.png`)

* **Method.**
  * Deficit image: a per-pixel linear baseline over ±0.7 d, excluding ±0.25 d around every eclipse of either binary, minus the mean in the central 3.8 h.
  * Each deficit image is fitted with a free-position Gaussian PSF (σ = 0.58 px, measured on the stacked EB primaries). Separately, it is fitted with the PSF fixed at each Gaia star (G < 17.5, < 60″).
  * Validation: the 6 S30 primaries and 5 secondaries of OGLE-LMC-ECL-51276, and 7 + 6 in S89, all land 0.3–2.4″ from that star's Gaia position. Gaussian-fit errors are 0.5–3″ for the stacks, so the WCS is good to about 2″.
* **The event** (S30) and the S89 eclipse both fit 2.7–2.8″ from Gaia DR3 4660118479179211904 and 12.5–15.2″ from the target. Positions and Δχ² are in the table above.
* **The depth each star would need** (PSF-integrated deficit 61 e⁻/s; T-band fluxes from Gaia):

| Star | Sep. from target | T (est.) | Eclipse depth needed | Position consistent? |
|---|---|---|---|---|
| Gaia …211904 (the eclipser) | 14.1″ | 14.52 | **26%** (aperture sum 32%) | yes (2.8″, 2.7″) |
| Target | 0 | 15.22 | 50% (61%) | no (15″, 12.5″) |
| OGLE-LMC-ECL-51276 | 9.8″ | 14.87 | 36% | no (22″, 20″), and the event is at its phase 0.66 |
| Gaia …4340224 | 16.9″ | 14.05 | 17% | no |
| Gaia …8109312 | 23.5″ | 12.21 | 3.1% | no (9–10″ off, Δχ² 1206) |
| Gaia …4848 | 5.5″ | 15.93 | 97% | no |

## 5. All sectors (`step5_eb.py`, `step5_search.py`, `step5_bls.py`, `step5_fold.py`, `step5_period.py`; `figs/step5_*.png`)

* **The 4.467-d binary.** It shows in QLP SAP for S27–93: P = 4.467083 d, T0 = 2132.799, primary 50 ppt, secondary 33 ppt at phase 0.338 (e cos ω ≈ −0.25), both with FWHM 5.5 h.
  * OGLE's ephemeris (P 4.4668736, T0 HJD 2460003.5856) predicts primaries 0.29 d early at the TESS epochs, which suggests a slightly longer period or apsidal motion. This was not pursued.
  * Its eclipses were masked (±0.3 d) for everything below.
* **Search.** S27–93 QLP SAP and year-1 ELEANOR-lite were used; S96–98 QLP were excluded because their background is about 27,000 e⁻/s and their rms 760–850 ppt. A 4 h box was run after a 1.5-d running median.
  * The event alone has SNR 5.3. There are 11 dips at or above that SNR and **0 brightenings**. At half the event's depth, 34 dips against 13 brightenings.
  * The dip excess is the 18.66-d eclipses. BLS peaks at 18.660 d and its harmonics/multiples (9.33, 6.22, 37.32, 55.98 d), all with the event within 0.6 h of phase 0.
* **Period.** P = 18.6600 d, T0 = 2131.254 BTJD.
  * The grid optimum is at 0.00002 d resolution. Per-epoch timing scatter is ±3 h, so the realistic σ_P is about 0.001 d (estimated, not formally fitted).
  * Per-epoch depths are 5–77 ppt: QLP apertures change between sectors, and S29 2112.59 lies in a noisy stretch.
  * The table is in `data/step5_period.json`.
* **Odd/even.** 41.3 ± 0.8 against 43.8 ± 0.7 ppt (per-epoch box means), 2.2σ. P = 37.32 d with two nearly equal eclipses cannot be excluded.
* **Secondary.** The best other phase is 0.706 at 13.1 ppt (3.9σ of the scan), and 2.1 ppt at phase 0.5. That is a tentative secondary of an eccentric orbit, or noise.
* **The vet's other epochs.**
  * 3736.06 is an 18.66-d eclipse.
  * 4010.73 (brightening) is in S98 QLP, which is unusable.
  * The vet's "P > 4.7 d" and "P ≈ 626 d" are superseded.

## 6. Shape

* The folded profile is V-shaped (ingress 86% of the half-duration), 8.3 h long.
* For the eclipser, rough estimates give R ≈ 11 R☉ and M ≈ 15 M☉ (M_G ≈ −4.4, BC ≈ −2.5). At P = 18.66 d, a ≈ 73 R☉ and a central eclipse would last about 30 h. A 26%, 8 h V-shaped event is therefore a grazing eclipse by a stellar companion.
* A transit fit with a stellar-density comparison is moot because the host is not the target. For the target itself (8 R☉, about 13 M☉), a central transit at 18.66 d would last about 27 h, so it fails as well.

## 7. Catalogs (`data/step7_catalogs.txt`, `data/exofop.json`, `data/step7_ogle.json`)

* **ExoFOP.** No TOIs, CTOIs, imaging, spectroscopy or companions. Not in the TOI list (8152 lines) or the CTOI list (5140 lines).
* **AAVSO VSX API, 72″.** Four entries: two Gaia EBs (P 3.657 d at G 19.2; P 3.631 d at G 17.3, 55″), a BE|GCAS star and an "L" star (G 13.9–15.4, about 60″ south). None is the target or the eclipser.
* **OGLE-IV.** See §1. The eclipser and the target are not in the EB or ELL lists.
* **Gaia DR3 vari_classifier** within 2′ (G < 17.5): 2 ECL, 2 LPV and 1 BE|GCAS|SDOR|WR, none of them these stars. vari_eclipsing_binary has two, both other stars.
* **VizieR.** Unreachable (CfA 502, CDS timeout). VizieR-only catalogues, including the TESS EB catalogue, were therefore not checked. The vet reports no TESS-EB entry.

## What would change the verdict

Nothing realistic. The 18.66-d eclipses are localised twice, 2020 and 2025, on a star 14″ from the target, with a method validated on a known binary in the same images. To confirm the new binary, OGLE-IV or ground photometry of 2MASS J05321291−6740216 could be phased on P = 18.660 d (or 37.32 d) at T0 = BTJD 2131.254. If the eclipse were ever shown to be on the target, it would still be a 50% stellar eclipse, not a planet.

## Not checked

* VizieR catalogues: TESS EB (Prša+2022) and the OGLE-III EB lists. The OGLE-IV list was read directly.
* OGLE-IV photometry of the eclipser: it is not in the variable-star collection, and OGLE's database for non-variables was not queried.
* A formal period error, and a proper eccentric-orbit fit of either binary.
* ELEANOR-lite and TGLC year-1 data were searched only at a reduced, assumed dilution. They do not change the period.
* SPOC products do not exist for this star.

## Pipeline notes

1. **The period recovery missed 20 repeats of 30–90 ppt.** Its depth expectation (from the single event) plus a running-median detrending, with a second EB's eclipses every 2.2 d left in, probably pushed them under 7σ. Mask known/periodic EB signals in the aperture (an OGLE/VSX/Gaia cross-match, or a BLS of the residuals) before the repeat search.
2. **Cross-match OGLE-IV (LMC/SMC) variables within 1′.** Here the target sits 9.8″ from a catalogued 0.3 mag EB. Its light curve is that EB's.
3. **The "secondary eclipse" flag was a repeat.** When the deepest other dip has a comparable depth and shape, test it as a second transit before calling it a secondary.
4. **Non-dwarf/LMC host check.** ϖ/σ < 2 with LMC proper motion and GSP-Phot Teff > 15 kK should override "main-sequence dwarf". Also flag TIC Tmag errors ≥ 0.5 mag, against TGLC/Gaia-derived T.
5. **QLP S96–98 for this camera/CCD have about 27,000 e⁻/s backgrounds and rms ≈ 800 ppt.** Gate them out. The vet's 4010.73 "brightening" came from there.

## Files

* **Scripts:** `step1_tic.py`, `step1_gaia.py`, `step1_products.py`, `step1_download.py`, `step2_look.py`, `step2_archival.py`, `step3_flags.py`, `step4_diffimage.py` (args: sector, epoch), `step4_where.py` (arg: sector), `step4_psfphot.py`, `step4_depths.py`, `step5_eb.py`, `step5_search.py`, `step5_bls.py`, `step5_fold.py`, `step5_period.py`, `step7_catalogs.py`, `step7_ogle.py`, plus `lcio.py`, `measure.py` and `common.py`. Run them with `../.venv/bin/python -W ignore` from this folder. (`step4_psfphot.py` is a superseded attempt: its median-image fluxes are degenerate; use `step4_depths.py`.)
* **Figures (`figs/`):** `step2_look.png` (S30 window, sector, and fold on the 4.467-d EB), `step3_flags.png`, `step4_diffimage.png` (S30), `step4_diffimage_s89.png`, `step5_eb.png`, `step5_search.png`, `step5_fold.png`, `step5_period.png` (18.66-d fold and secondary scan).
* **Data:** `data/` (JSON outputs listed above; light curves in `data/lc`, cutouts in `data/tesscut`, OGLE files in `data/ogle`).
