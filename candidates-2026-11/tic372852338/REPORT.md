# TIC 372852338: follow-up of the periodic find (P 15.9349 d, T0 1365.4069 BTJD, 17.7 ppt, 4 h)

Analysis run 2026-11-02. It uses public data only: MAST (QLP light curves for 42 sectors, S1–S98; the year-1 HLSPs GSFC-ELEANOR-lite (12 sectors), T16 (9), TASOC (5, CBV and ENS) and TGLC (7); TESScut for S2, S6 and S69; QLP S2 light curves of 25 other stars on camera 4 CCD 4), Gaia DR3 (ESA archive), TIC 8.2, SIMBAD (CfA TAP mirror), the AAVSO VSX API, and ExoFOP (target JSON, TOI and CTOI lists, read only). Nothing was submitted anywhere. No SPOC or TESS-SPOC products exist for this star.

## Verdict: **noise / systematic artifact.** Neither "transit" is in the star's light. The 15.93 d period is just the time between two QLP scattered-light artifacts in Sector 2. The vet's weaker 15.92 d signal in the later sectors is noise.

* **The two sweep events are both in Sector 2. They are 15.935 d apart, which is the claimed period.**
  * Epoch 0 is at 1365.407, 1.6 d before the S2 orbit gap.
  * Epoch 1 is at 1381.342, 0.15 d before the end of S2.
  * The only other ephemeris time in an "S6" file is 1476.951. It falls at the start of the S6 mid-sector gap (1476.84), and QLP there is flat to within ±3 ppt.
  * The star has no S5 data, so the ephemeris predicts no transit in any other year-1 sector that QLP flags as an event.
* **Epoch 0 (1365.407) appears only in QLP, and it scales with aperture area.**
  * QLP depths: KSPSAP 18.7 ± 3.4 ppt and SAP 25.4 ± 4.5. By aperture: SML **9.6**, default **18.7**, LAG **26.5** ppt. A dip that grows with aperture area is the signature of a background error, not of a star dimming.
  * The QLP background starts climbing from ~0 to 6000 e⁻/s (scattered light) within hours of the event.
  * Every other reduction of the same pixels is flat:

| Product at 1365.407 | Depth [ppt] |
|---|---|
| QLP KSPSAP / SAP | 18.7 ± 3.4 / 25.4 ± 4.5 |
| GSFC-ELEANOR-lite RAW / CORR | 3.5 ± 2.5 / 0.4 ± 3.0 |
| T16 IRM2 (raw mag) / TFA2 | −0.3 ± 1.5 / 0.0 ± 0.9 |
| TASOC FLUX_RAW | 8.2 ± 9.8 (sits on a scattered-light step) |
| TGLC cal_aper / cal_psf | −0.7 ± 0.9 / −1.1 ± 1.0 (all cadences TGLC-flagged) |
| Own TESScut, r = 1 px: global / annulus / column-wise background | 0.6 ± 1.2 / 2.5 ± 1.3 / 2.8 ± 1.2 |
| Own TESScut, r = 2.5 / 3.5 px, column-wise background | 1.2 ± 1.6 / 3.9 ± 1.9 |

* **Epoch 1 (1381.342) is the last 3 h of Sector 2.**
  * QLP KSPSAP falls by about 35 ppt in the final few cadences and then rises steeply. Meanwhile the QLP background drops by 385 e⁻/s per hour, and QLP SAP flux tracks the background at r = 0.93 over ±1 d.
  * The box has no post-event baseline: the fit is degenerate and gives −1010 ± 185 ppt.
  * T16 IRM2 (1.9 ± 1.6), ELEANOR (−0.1 ± 1.1) and own TESScut photometry (r = 1 px: −0.5 ± 1.1 global background, +0.3 ± 1.2 column-wise) show nothing.
* **The 1365.4 effect is partly common to the CCD in QLP.** Among 25 QLP S2 stars on the same CCD (camera 4 CCD 4, within 30′), the median 4 h depth at 1365.407 is +1.8 ppt (SAP). Four of 25 are > 3σ deep (up to 22.7 ppt in SAP), and one is > 3σ bright.
* **The vet's refined signal (P 15.92434 d, ~1 ppt, "24 transits" in S64–98) is not real.**
  * Folded QLP KSPSAP/DET over all 42 sectors gives **0.41 ± 0.16 ppt**. By year: S1–13 −0.23 ± 0.30, S27–39 0.27 ± 0.30, S61–69 1.13 ± 0.40, S87–98 0.54 ± 0.27.
  * None of 58 individual epochs is a ≥ 3σ dip.
  * A box search over 1–40 d puts 15.924 d at SNR 3.6 (all data) and 4.2 (S61+). About 12,700 of 60,000 trial periods score higher.
  * The strongest peaks (1.122, 1.496, 1.870, 2.244 d) appear just as strongly in the **inverted** light curve (brightenings). They are QLP systematics, not dips.
* **The vet's "30 ppt at S69 3193.01" is a scattered-light ramp.**
  * QLP SAP rises by 50% and the background from 5,500 to 49,000 e⁻/s within ±0.5 d.
  * Own TESScut photometry with column-wise background gives 0.6 ± 1.1 ppt (r = 1 px) and −1.2 ± 2.4 ppt (r = 2.5 px).
* **The host is a normal G dwarf with no sign of binarity.** Gaia DR3: ϖ 1.959 ± 0.012 mas, M_G 5.27, BP−RP 0.93, RUWE 0.87, no NSS entry.

**Confidence.** High (> 95%) that there is no transiting object at 15.93 d (or 15.92 d) on this star:
* A 17.7 ppt, 4 h transit at TESS precision for T = 13.3 would be ≥ 10σ per event in every independent reduction. It is ≤ 3 ppt in all of them.
* The vet-level 1 ppt periodic signal is at the noise floor of the QLP period search, and brightenings show the same peaks.

## Status of each step

| # | Step | Status |
|---|---|---|
| 1 | Host: TIC 8.2, Gaia DR3 (astrometry, GSP-Phot, FLAME, RV, RUWE/IPD), NSS and variability tables for the target and the 3 neighbours with G < G★+6 within 1′, LMC check | **verified**: foreground G dwarf, 510 pc; no binarity indicator; no NSS entry |
| 2 | Depth in every reduction (QLP SAP/KSPSAP/SML/LAG, ELEANOR-lite, T16, TASOC, TGLC, own TESScut at 4 apertures × 3 backgrounds) | **verified**: the dip is only in QLP, and grows with QLP aperture size |
| 3 | Systematics: quality flags, gaps, orbit and sector edges, scattered light / background, 25 same-CCD stars | **verified**: both events sit on scattered-light background changes at the start of a ramp (1365.4) and at the sector end (1381.3) |
| 4 | Location: difference image / neighbours' required depths | **moot**. Own aperture photometry and four independent pipelines show no dip at the target's position, so there is nothing to localise. Comparison stars in the cutout are flat too |
| 5 | All sectors: every epoch of both ephemerides, fold by year, period search of dips and brightenings, the vet's S69 event | **verified**: no repeat in 58 epochs; no significant periodicity |
| 6 | Shape: batman fit of the QLP epoch-0 dip | **run**: grazing V (k 0.43, b 1.19), ρ 0.43 ρ☉ vs 1.4–1.5 ρ☉. Meaningless for an artifact |
| 7 | ExoFOP / TOI / CTOI / VSX / SIMBAD | **run**: nothing known. VizieR (CfA 502, CDS timeout) not available, so the TESS EB catalog and VizieR-VSX were not queried |

---

## 1. Host star (`data/step1_products.txt`, `data/step1_gaia.txt`, `data/step1_gaia.json`)

| Quantity | Value |
|---|---|
| TIC 8.2 | Tmag 13.334, V 14.05, Teff 5582 ± 122 K, logg 4.56, R 0.864 R☉, M 0.99 M☉, ρ 1.53 ρ☉, d 512 pc, lumclass DWARF; 2MASS J06315625-6455086; no contamination ratio |
| Gaia DR3 5284833532607715072 | 0.35″ from the TIC position, G 13.81, BP−RP 0.925, ϖ 1.959 ± 0.012 mas (d 510 pc), μ (−17.15, +13.02) mas/yr |
| Binarity indicators | RUWE 0.87, ipd_frac_multi_peak 0, ipd_gof_harmonic 0.005, astrometric excess noise 0, non_single_star 0, DSC binary probability 0.0002 |
| Gaia RV | +81.2 ± 3.1 km/s (21 transits). No rv_chisq_pvalue or amplitude is published at this G_RVS, so RV variability cannot be tested |
| GSP-Phot / FLAME | Teff 5528 K, logg 4.48, R 0.849 (GSP-Phot) / 0.872 R☉ (FLAME), M 0.956 M☉, L 0.63 L☉, age 1.8 Gyr, ESP-HS type G |
| CMD | M_G 5.27 at BP−RP 0.93: on the main sequence |
| LMC? | No. The star lies toward the LMC outskirts, but its 167σ parallax and its proper motion are Galactic. The +81 km/s RV suggests thick-disk kinematics; the LMC is at ~+260 km/s |
| NSS (two-body, acceleration, non-linear spectro, VIM), vari_* | No entry for the target or for the neighbours with G < 19.8 within 1′. The exception is the G 19.36 source at 48″, which is an RR Lyrae |

**Neighbours within 1′ with G < 19.8:**
* G 17.47 at 46″ (ϖ 0.50).
* G 19.36 at 48″: Gaia RR Lyrae (VSX RRAB, P 0.374 d, 18.81–19.76 G; SIMBAD OGLE LMC748.22.000407).
* G 16.86 at 52″ (ϖ 0.26).

The RR Lyrae's 0.95 mag swing is at most ~3–4 ppt of the blend, and with a 0.37 d period it cannot make two isolated 4 h dips. Neither of the other two is variable in Gaia.

## 2. Depths (`data/step2_look.json`, `data/step3_qlp_s2_clean.json`, `data/step2_own_phot_s2.json`, `figs/step2_zoom.png`, `figs/step2_sweep_events.png`, `figs/step2_own_phot_s2.png`)

**Method.** `measure.py` 4 h trapezoid with a quadratic baseline per segment, on quality = 0 cadences. For QLP S2 the window is ±0.5 d, values more than 30% from the median are rejected, and the error is σ_white·β.
* The slid empirical error in S2 is inflated to ~90 ppt by catastrophic QLP cadences (values near 0 or 2) elsewhere in the sector.
* The rest-of-S2 scatter of the same 4 h box in KSPSAP is 1.26 ppt (134 positions). The largest dip found elsewhere in S2 is 2.4 ppt.

| Epoch | QLP SML / default / LAG KSPSAP [ppt] | Other pipelines | Own TESScut (r = 1 px, column bkg) |
|---|---|---|---|
| 0, 1365.407 | 9.6 ± 2.0 / 18.7 ± 3.4 / 26.5 ± 4.6 | ELEANOR 0.4 ± 3.0, T16 0.0 ± 0.9, TGLC −0.7 ± 0.9 | 2.8 ± 1.2 |
| 1, 1381.342 | ~−35 in the last cadences; fit degenerate (only 12 good points, no post-event baseline) | ELEANOR 0.0 ± 1.0, T16 2.1 ± 1.3 | 0.3 ± 1.2 |
| 7, 1476.951 | flat (the box starts the S6 gap; 6 of 7 in-box cadences flagged) | ELEANOR 0.6 ± 1.1, T16 −0.4 ± 1.4 | not measurable (7 cadences) |

The SML : default : LAG ratio of 1 : 1.9 : 2.8 at epoch 0 grows with aperture area. A real eclipse on the target would give the *largest* depth in the smallest aperture, because the larger ones add neighbours' light. An additive error in the subtracted background instead grows with the number of pixels.

## 3. Systematics (`data/step3_flags.json`, `data/step3_neighbors_s2.json`)

* **Epoch 0.**
  * 3 of 8 in-box cadences are flagged by QLP.
  * QLP SAP_BKG goes from −800 to 6000 e⁻/s within ±1 d. The event sits where the background begins its scattered-light rise (+17 e⁻/s per hour in the box, then much faster).
  * ELEANOR's and TASOC's backgrounds have a local dip-and-recovery exactly at the event (see `figs/step2_zoom.png`).
  * QLP SAP shows several ±50 ppt steps in the same day.
* **Epoch 1.**
  * The box lies 0.002 d from the last good cadence of the sector.
  * The background falls steeply (−385 e⁻/s per hour) and SAP flux follows it (r = 0.93).
* **Same CCD.** At 1365.407, 25 QLP S2 stars on camera 4 CCD 4 have a median SAP depth of +1.8 ppt. Four are > 3σ deep (e.g. TIC 372852373 at 22.7 ± 5.4 ppt and TIC 372852330 at 3.7 ± 0.7). QLP S2 has a common systematic at that time. No star had enough data at 1381.342 for a measurement.
* **Comparison stars inside our S2 cutout** (6 stars, 0.5–20× the target's flux) are flat at both epochs, within ±2 ppt except for faint, noisy ones.

## 4. Location

Nothing to localise: no dip is present in the pixels.
* Own photometry at 1, 2.5 and 3.5 px with three background methods gives ≤ 3.9 ppt. That is consistent with zero at the 2–3σ level and 5–15σ below the sweep's 17.7 ppt.
* The four independent FFI pipelines agree.
* The vet's FFI difference images (S95–98, for its 1 ppt signal) were also null.

## 5. All sectors (`data/step5_search.json`, `figs/step5_fold.png`, `data/step2_own_phot_s6_s69.json`)

* **Data.** QLP KSPSAP/DET covers 42 sectors (S1–13 without S3 and S5; S27–39; S61–69; S87–98). It was binned to 30 min and clipped at 5 MAD: 44,329 points.
* **Sweep ephemeris (P 15.9349).** No covered epoch outside S2 shows a dip: all are within ±3.7 ppt in QLP, ELEANOR, T16 and TGLC (`data/step2_look.json`). A 17.7 ppt transit would have shown in S1, S4 (1429.15) and S7–S13 (1492.9–1652.2), and it is absent from all of them.
* **Vet ephemeris (P 15.924338, T0 1361.70864).**
  * Fold over all data: 0.41 ± 0.16 ppt. By year: −0.23 ± 0.30 (S1–13), 0.27 ± 0.30 (S27–39), 1.13 ± 0.40 (S61–69), 0.54 ± 0.27 (S87–98).
  * Of 58 epochs, 0 are ≥ 3σ dips and 0 are ≥ 3σ brightenings. The largest is 3.6 ± 1.2 ppt at 3161.16 (S68).
* **Period search (BLS, 4 h, 1–40 d, SNR objective).**

| Data | Dips: top periods (SNR) | Brightenings (inverted flux): top periods (SNR) | 15.924 d |
|---|---|---|---|
| All | 1.122 (13.4), 1.496 (11.1), 1.870 (10.0), 2.244 (9.2) | 1.122 (15.1), 1.496 (12.7), 1.870 (10.8), 2.244 (10.3) | SNR 3.6; 12,690 grid points higher |
| S61+ | 1.122 (9.6), 1.496 (7.6), 2.244 (7.4) | 1.122 (10.9), 1.496 (8.5), 2.244 (8.5) | SNR 4.2; 4,834 higher |

The harmonic ladder near 1.12 d (n × 0.374 d) matches the period of the G 19.36 RR Lyrae 48″ away (VSX P = 0.37396 d). That ladder is probably that star's light in the QLP aperture, a periodic signal and not dips. It appears equally as brightenings and has no transit-like content. This attribution was not tested pixel by pixel.
* **The vet's S69 "30 ppt" (3193.01).** QLP SAP rises from 0.77 to 1.56 (normalised) while the background goes from 5.5k to 49k e⁻/s. QLP DET in 0.1 d bins varies by ±2%. Own TESScut photometry (column-wise background): 0.61 ± 1.11 ppt at r = 1 px, −1.22 ± 2.35 at r = 2.5 px. It is an artifact.
* **Odd/even and secondary.** Moot: there is no primary signal.

## 6. Shape (`data/step6_fit_s2.json`)

A face-value batman fit to QLP KSPSAP at epoch 0 (P fixed at 15.9349 d, circular, quadratic LD 0.42/0.20) converges to:
* a grazing solution: k = 0.43, b = 1.19, T14 4.8 h;
* ρ = 0.43 ρ☉, against 1.44–1.53 ρ☉ for the star.

For this star a central transit at 15.93 d would last 3.96 h, so the ~4 h width itself is not anomalous. The fit carries no weight, because the dip is not in the star's light (§2).

## 7. Catalogs (`data/step7_catalogs.json`, `data/step7_catalogs2.json`)

* **ExoFOP.** No TOIs, CTOIs, imaging, spectroscopy, time series or companions. Not in the TOI list (8152 lines) or the CTOI list (5140 lines). The first TOI download failed and the retry succeeded.
* **AAVSO VSX API, 90″.** The target is not listed. Two Gaia RR Lyrae are listed: 5284833493950412288 (RRC, 0.381 d, G 18.8–19.2, 47″) and 5284645786703831808 (RRAB, 0.374 d, G 18.8–19.8, 48″).
* **SIMBAD (CfA TAP), 72″.** The target is not in SIMBAD. Only the two OGLE LMC RR Lyrae (LMC748.22.000407 and .000234) are there.
* **VizieR.** The CfA mirror returned 502 and CDS timed out, so the VizieR copy of VSX and the TESS EB catalog (J/ApJS/258/16) were not queried. The vet's own check of those catalogs found nothing.

## What would change the verdict

* A dip of ≥ 10 ppt at a 15.93 d (or other) ephemeris in **raw pixel** photometry that a QLP-independent pipeline also confirms. Nothing like that exists in 42 sectors.
* For the vet's ~1 ppt / 15.92 d signal: a fold of SPOC-quality 200-s photometry (own TESScut S61–98) reaching > 7σ, with the same depth in each year and no matching brightening signal. The QLP data give 0.41 ± 0.16 ppt, so this is unlikely.

## Not checked

* A per-pixel difference image of epoch 0 (moot, since there is no deficit in the pixels).
* The QLP background algorithm itself. The mechanism (background mis-estimate at the onset of scattered light and at the sector end) is inferred from the data, not from the QLP code.
* Whether the 0.374/1.12 d ladder is the RR Lyrae's light in the QLP aperture (§5).
* VizieR catalogs (servers down).

## Pipeline notes

1. **Ephemerides built from two events in one sector need a second reduction before they are reported.** Here both "transits" were QLP-only, and the period was simply their separation. A cross-check against any one of ELEANOR, T16, TGLC or TESScut would have killed them.
2. **Reject QLP events where the depth grows with aperture size** (SML < default < LAG) or where the event lies within ~0.2 d of a sector or orbit edge while the background changes by > 1000 e⁻/s.
3. **The vet re-derived a different signal.** Its ephemeris (15.924 d, T0 1361.71) and the 1 ppt depth came from S64–98 and never tested the sweep's S2 events, because it had no S2 data. When the vet's depth differs from the sweep's by > 10×, it should say that it is testing a different signal.
4. **Period-search significance should be compared with the same search on inverted flux.** Here the top dip and brightening periods are identical.
5. The label "QLP S2, S6" was misleading: both events are in S2.

## Files

Scripts: `step1_products.py`, `step1_download.py`, `step1_gaia.py`, `step1_tesscut.py`, `step2_look.py`, `step2_zoom.py`, `step2_own_phot.py`, `step3_flags.py`, `step3_neighbors.py`, `step5_search.py`, `step6_fit.py`, `step7_catalogs.py`, `step7_catalogs2.py`, plus `hlsp.py` (loader for QLP and every year-1 HLSP), `measure.py`, `lcio.py` and `common.py`. Run them with `../.venv/bin/python -W ignore` from this folder. `step2_own_phot.py` takes `SECTOR:TC` arguments: `2:1365.4069 2:1381.3418` and `6:1476.951 69:3193.009`.

The S2 QLP clean-depth numbers in `data/step3_qlp_s2_clean.json` came from an inline run of the same `fit_depth` call (±0.5 d window, 30% outlier cut); there is no separate script for them.

Data: `data/step1_products.txt`, `data/step1_gaia.{txt,json}`, `data/gaia_2arcmin.csv`, `data/step2_look.json`, `data/step2_own_phot_s2.json`, `data/step2_own_phot_s6_s69.json`, `data/step3_flags.json`, `data/step3_qlp_s2_clean.json`, `data/step3_neighbors_s2.{txt,json}`, `data/step5_search.json`, `data/step6_fit_s2.json`, `data/step7_catalogs*.{txt,json}`.

Figures (`figs/`): `step2_sweep_events.png`, `step2_zoom.png`, `step2_own_phot_s2.png`, `step2_own_phot_s6_s69.png`, `step5_fold.png`.
