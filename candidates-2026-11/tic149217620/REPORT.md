# TIC 149217620: follow-up of the single-transit find at BTJD 1329.011 (QLP S1), with a claimed repeat at 3028.91 (S63)

Analysis run 2026-11-02 on public data only: MAST light curves (QLP in 40 sectors S1–S98; GSFC-ELEANOR-LITE and TASOC CBV/ENS for S1–S2; no SPOC or TESS-SPOC product exists), TESScut for S1 and S63, QLP light curves of 25 other stars on the same CCD in each event sector, Gaia DR3 (including the NSS and variability tables for every source within 1′), the TIC 8.2, SIMBAD (CfA mirror), the AAVSO VSX API, and read-only ExoFOP pages and TOI/CTOI lists. Nothing was submitted anywhere.

## Verdict: **noise/systematic artifact.** Neither event is an ~8 ppt dip of TIC 149217620.

**The target's own pixels do not dim by 8 ppt at either epoch.**
* **Joint per-pixel fit.** A fit of the per-pixel depth images (Gaussian PSF on the target and on each Gaia neighbour, plus a background plane) puts only **1.6 ± 0.7 ppt (S63) and 1.6 ± 0.9 ppt (S1)** on the target. That excludes the claimed 8 ppt at about 9σ and 7σ.
* **Small-aperture photometry.** Our own 1-px-radius TESScut photometry gives 0.9 ± 0.8 ppt (S63) and 0.5–1.7 ± 1.3–1.8 ppt (S1).
* **Depth grows with aperture.** In S63 it rises from 0.9–1.8 ppt (r = 1 px) to 5–11 ppt (r = 3 px). The flux loss is outside the star's core, which is why QLP's large and small apertures disagree by 2.4× (the vet's aperture test).

**The S63 "repeat" (BTJD 3028.91) is a QLP background artifact that affects the whole CCD.**
* **Common to other stars.** At the same moment, **23 of 25 other QLP stars on camera 4 / CCD 3 show a "dip"**, 7 of them above 3σ.
* **Constant flux loss.** Depth scales with 1/flux, as a constant flux deficit would (stars of T 12.5–14: median 3.0 ppt; T 14.8–14.9: 9–13 ppt). Scaled to the target's brightness, the common-mode deficit is **3.5 ± 0.3 ppt**.
* **Background.** The event sits on the steep decline of a scattered-light hump: QLP background 1281 e/s against a sector median of −20, falling at 3340 e/s per day.

**The S1 dip appears in only one reduction, at the CCD edge, during a background ramp.**
* **Pipelines disagree.**
  * QLP KSPSAP: 8.0 ± 2.8 ppt (red noise included; 1.4% of slid boxes are as deep).
  * Eleanor-lite RAW/CORR/PCA: 1.1–2.9 ± 1.4–1.8 ppt.
  * TASOC ENS: 0.3 ± 4.8 ppt.
  * Our own TESScut photometry: 0.5–4.9 ppt with ±1.2–3.4 ppt errors.
* **Edge and background.** The target is **1.5 px from the CCD edge**: only cutout rows 0–11 are on silicon, and the star sits at row 10.5. QLP's background is −1125 e/s and rising at 1960 e/s per day.
* **Not unique.** In S1 alone, a dip at 1327.00 (9.3 ppt, SNR 8.0) and a brightening at 1326.58 (SNR 8.5) are stronger than the event. Across 39 QLP sectors, 10 independent dips and 5 brightenings are as strong (6 h box).

**The two "transits" do not have the same shape.**
* Re-centred, S1 lasts 4.8–6.0 h and S63 lasts 9.1–14.8 h.
* For one body on one orbit the durations should match. A central transit of this star at P = 1700 d would last ~27 h.

**Confidence:** high (~90%) that TIC 149217620 does not have an ~8 ppt transit at either epoch. A ≲2 ppt event on the target cannot be ruled out at either epoch.

**A weak, unconfirmed lead on the neighbour.** In both sectors the per-pixel fit prefers a dip on the 42″ M dwarf **TIC 149217623** (Gaia DR3 4757827919969385088; T 15.2, Teff 3600 K, R 0.45 R☉, 260 pc). The implied eclipse depth is **2.4 ± 0.5% (S63, ΔBIC 17 over the target)** and **1.4 ± 0.5% (S1)**. Its 1-px aperture shows 9.3 ± 2.0 ppt (S63) while blank-sky apertures show none. Both epochs fall on strong scattered-light gradients, so structured background could produce this. If it were real, it would be a ~1–2% event of ~9–15 h on a 0.45 R☉ star (a ~5–7 R⊕ body), at P = 1699.9 d or one of its allowed aliases.

## Status of each step

| # | Step | Status |
|---|---|---|
| 1 | Host: TIC 8.2, Gaia DR3 (astrometry, RUWE/IPD, NSS and vari for all sources within 1′, RV, GSP-Phot/FLAME), GALAH RV, SIMBAD | **verified**: a single, old, metal-poor G dwarf at 716 pc (not LMC). No binarity indicators. The bright neighbours have no NSS or vari entries |
| 2 | Depth in QLP SAP/KSPSAP/DET, eleanor RAW/CORR/PCA, TASOC raw/CBV/ENS, own TESScut (3 backgrounds × 4 apertures), 3 baselines; re-centring | **verified**: S1 only in QLP. S63 in QLP SAP and DET, but in our own photometry the depth grows with aperture (0.9 → 5–11 ppt) |
| 3 | Quality flags, dumps, gaps, background, jitter, 25 same-CCD stars per event | **verified**: S63 is a CCD-wide QLP deficit (23/25 stars positive; 3.5 ± 0.3 ppt equivalent). S1 shows a weaker common mode (19/25 positive, 1.7 ± 0.4 ppt equivalent), sits 1.5 px from the CCD edge, and has steep background ramps at both epochs. No dumps, flags in transit or jitter excess |
| 4 | Per-pixel depth images; PSF fits for target, neighbours, plane; blank-sky apertures | **verified**: on target ≤ 1.6 ± 0.7 (S63) and 1.6 ± 0.9 ppt (S1). The pixels prefer the 42″ M dwarf TIC 149217623 (1.4–2.4%) |
| 5 | All 39 QLP sectors: box search, dips vs brightenings, allowed periods | **run**: S1 is outranked by 10 dips and 5 brightenings; S63 by 7 and 4. No other repeat. P/2 and P/4–P/12 are excluded; P and P/3 are allowed |
| 6 | batman fits and implied density | **run**: S1 T14 6.0 h with ρ★ 3–32 ρ☉ (Δχ² 15 at the Gaia 0.69 ρ☉, P = 1700 d); S63 T14 14.8 h. The two shapes disagree |
| 7 | ExoFOP / TOI / CTOI / VSX / SIMBAD / VizieR | **run**: nothing on ExoFOP, no TOI or CTOI, VSX empty; SIMBAD lists only catalogue IDs and GALAH. VizieR unreachable on all mirrors |

## 1. The stars

| | Target: Gaia DR3 4757827988688861696 = TIC 149217620 | 42″ neighbour: Gaia DR3 4757827919969385088 = TIC 149217623 |
|---|---|---|
| G / BP−RP / T | 13.79 / 0.803 / 13.38 | 16.28 / 2.209 / 15.21 |
| Parallax | 1.397 ± 0.013 mas (716 pc) | 3.845 ± 0.037 mas (260 pc) |
| μ | (−2.36, +2.29) mas/yr | (−6.23, +16.22) mas/yr |
| RUWE / IPD multi-peak / harmonic amp. | 1.00 / 0% / 0.009 | 0.99 / 0% / 0.011 |
| non_single_star / NSS / vari | 0 / none / none | 0 / none / none |
| Parameters | GSP-Phot Teff 5658 K, logg 4.34, [M/H] −0.64. FLAME R 1.10 R☉, M 0.93 M☉, L 1.12 L☉, age 11 Gyr (ρ 0.69 ρ☉). TIC Teff 5985 K, R 1.04 R☉, M 1.1 M☉ | TIC Teff 3595 K, R 0.45 R☉ (M dwarf) |

* **Radial velocity.** Gaia RV −0.02 ± 3.68 km/s (19 transits). SIMBAD lists GALAH DR3 RV −3.305 ± 0.104 km/s (GALAH 161211003901232; Buder et al. 2021). The two agree within 1σ, which gives no sign of a large RV change, but two epochs are not a binary test.
* **Not in the LMC.** RA 82.0°, Dec −61.9° lies outside the LMC box, and the parallax is 107σ.
* **Neighbours within 1′.** Gaia lists 15 sources; those that could matter in the aperture are:
  * TIC 149217623, 42″ (above);
  * Gaia DR3 4757826476861931008, G 16.68 at 48″, a distant giant according to the TIC (R 5.9 R☉, 7 kpc);
  * Gaia DR3 4757827954329120640, G 16.89 at 53″;
  * fainter stars (G 18.0–20.4).

  We checked all of them in the NSS and vari tables: there are no entries.
* **On a planet radius.** On the FLAME radius, an 8.3 ppt dip would mean a 10.9 R⊕ body. This is moot, since the dip is not on the star.

## 2. The events in every reduction (`data/step2_archival.json`, `data/step2_own_phot_s*.json`)

**S1 (camera 4, CCD 4; BTJD 1329.011, 6 h box).** Depths in ppt for three baselines (±1 d quadratic / ±0.75 d linear / ±1.5 d quadratic). Errors are the larger of white×β and the empirical slid-box scatter.

| Product | Depth (ppt) | Error / note |
|---|---|---|
| QLP KSPSAP | 7.96 / 7.15 / 7.70 | ± 2.7–2.9 (β 1.6; frac deeper 0.014) |
| QLP SAP | 8.59 / 8.25 / 4.44 | ± 5.0–8.6 |
| Eleanor-lite RAW / CORR / PCA | 1.6–2.9 / 1.5–2.8 / 1.1–2.3 | ± 1.4–1.8 |
| TASOC ENS FLUX_CORR | 0.30 / 0.27 / 2.64 | ± 4.2–4.8 |
| TASOC FLUX_RAW | 3.1 / 4.5 / 13.5 | ± 13–15 |
| Own TESScut, r = 1 / 1.5 / 2 / 3 px | 0.5–1.7 / 1.0–2.7 / 1.4–3.8 / 1.3–4.9 | ± 1.2–3.4 (three background methods) |

* The TASOC CBV FLUX_CORR column is unusable at this epoch: its scatter is of order 10⁴ ppm.
* Re-centred on QLP KSPSAP, the event is at 1329.026, lasts 4.8 h and is 9.2 ppt deep. On QLP SAP the best box is instead 10.6 h long and centred 0.15 d later, which shows how unstable the feature is.
* Injecting 8.27 ppt into our own photometry recovers 8.28 ppt, so our photometry would have seen a real 8 ppt dip.

**S63 (camera 4, CCD 3; BTJD 3028.91).**

| Product | Depth (ppt) | Error / note |
|---|---|---|
| QLP SAP | 7.43 / 7.81 / 8.12 | ± 1.3–1.4 |
| QLP DET_FLUX | 6.86 / 6.73 / 6.93 | ± 1.0–1.1 |
| Own, global faint-pixel background, r = 1 / 1.5 / 2 / 3 px | 0.92 / 3.01 / 4.55 / 5.27 | ± 0.8 / 0.9 / 1.3 / 2.2 |
| Own, annulus background, r = 1 / 1.5 / 2 / 3 px | 1.80 / 4.70 / 7.21 / 10.63 | ± 0.9 / 1.2 / 1.4 / 2.2 |
| Own, plane background, r = 1 / 1.5 / 2 / 3 px | 1.15 / 3.39 / 5.08 / 6.20 | ± 0.8 / 0.9 / 1.0 / 1.9 |

* Regressing out the background changes our own depths by less than 0.5 ppt. The flux–background correlation is |r| ≤ 0.13.
* A dip that grows from about 1 ppt in the core pixel to 5–11 ppt at r = 3 px is not a dimming of the target.

## 3. Systematics (`data/step3_flags.json`, `data/step3_neighbors_s1.json`, `data/step3_neighbors_s63.json`)

* **S1.**
  * Flags: no QLP-flagged cadence in transit, and five 4096 (scattered-light) flags within ±1 d. Eleanor flags 128 and 131072 on 4 in-transit cadences.
  * Timing: no momentum dump within ±2 d; 3.7 d from the mid-sector gap.
  * Background and jitter: QLP background −1125 e/s at the event (sector median −32), rising at +1960 e/s per day. QLP centroid jitter in transit is 0.87× the sector median. The first 2 d of S1 show a 0.2 px centroid drift and ±1–2% KSPSAP swings.
  * Edge: the target is 1.5 px from the CCD edge.
* **Other stars, S1.** Of 25 stars on camera 4 / CCD 4, 19 have a positive depth, none above 3σ. The flux-scaled common mode is 1.7 ± 0.4 ppt at the target's brightness (stars of T 12.5–14: median 1.2 ppt). A weak CCD-wide deficit is present.
* **S63.**
  * Flags and timing: no flags within ±1 d, no dump within ±2 d, 1.3 d from a gap.
  * Background: QLP background 1281 e/s at the event (sector median −20), falling at −3342 e/s per day. The event sits on the decline of a 2500 e/s scattered-light hump (`figs/raw_window_3029.png`).
  * Jitter: 1.02×.
* **Other stars, S63.** Of 25 stars on camera 4 / CCD 3, 23 are positive and 7 are above 3σ. Depth scales with 1/flux:
  * T 9.9: 0.3 ppt;
  * T 12.1: 1.9 ppt;
  * T 13.0: 5.1 ppt;
  * T 13.6: 7.8 ppt;
  * T 14.9: 13.0 ppt.

  The common mode is 3.5 ± 0.3 ppt at the target's brightness (T 12.5–14 stars: median 3.0 ppt). It is a QLP background over-subtraction during the scattered-light decline.

## 4. Location (`figs/diffimage_s1.png`, `figs/diffimage_s63.png`, `data/step4_diffimage_s*.json`, `data/step4_nbphot.json`)

* **Method.** A per-pixel 6 h box with a local quadratic baseline (±1 d), fitted with nested models: constant, plane, target PSF, the PSF of each Gaia star, and combinations. The PSF is a Gaussian with σ = 0.6 px, fitted to the median image; the fit uses 65 pixels in S63 and 41 in S1.

| Model | S63 χ² / BIC | S1 χ² / BIC |
|---|---|---|
| null | 223.3 / – | 86.3 / – |
| plane | 171.3 / 183.8 | 50.1 / 61.2 |
| plane + target | 165.8 / 182.5 | 47.0 / 61.9 |
| plane + 42″ neighbour | **148.4 / 165.1** | 41.8 / 56.6 |
| constant + neighbour | 165.2 / 173.5 | **47.0 / 54.5** |

* **Joint fit (plane + target + neighbour).**
  * Target: **1.6 ± 0.7 ppt (S63) and 1.6 ± 0.9 ppt (S1)**.
  * Neighbour TIC 149217623: **2.35 ± 0.50% (S63) and 1.42 ± 0.50% (S1)** of its flux.
  * Flux scale: the neighbour's PSF amplitude is 0.12–0.17 of the target's (TIC Tmag ratio 0.19).
* **Small apertures (r = 1 px, global background).**
  * Target: 0.9 ± 0.8 ppt (S63) and 1.7 ± 1.6 ppt (S1).
  * Neighbour: 9.3 ± 2.0 ppt (S63) and 10.4 ± 4.8 ppt (S1), i.e. 0.39 e/s/px.
  * Blank-sky 2×2 apertures: median −0.04 ± 0.14 e/s/px (12 apertures, S63) and 0.02 ± 0.05 (7 apertures, S1).
* **Eclipse depths each neighbour would need** for the QLP depth (from the vet; consistent with ours): TIC 149217623 5%, Gaia 4757826476861931008 9%, and 67–98% for the G 18.2–18.6 stars at 33″. The pixels do not favour the faint ones.

## 5. All sectors (`data/step5_search.json`)

* **Search.** 39 QLP sectors (1029 d): S1–S13 except S3, S27–S39 except S28 and S38, S61–S69, S87–S98. We searched with 6 h and 9 h boxes on QLP KSPSAP/DET after a 1 d running median, using a per-sector empirical σ.
* **6 h box.**
  * S1 event: SNR 6.6, 7.7 ppt. 10 independent dips and 5 brightenings are at least as strong.
  * S63 event: SNR 7.1, 4.8 ppt. 7 dips and 4 brightenings are at least as strong.
  * The strongest excursions are S11 systematics (±40–95 ppt). The next are 1327.00 (S1 dip, SNR 8.0), 1326.58 (S1 brightening, SNR 8.5) and 1627.24 (S12 brightening, SNR 8.7).
* **9 h box.** S1: SNR 5.2, with 15 dips and 11 brightenings at least as strong. S63: SNR 6.8, with 7 dips and 3 brightenings.
* **No third event** of similar depth anywhere.
* **Allowed periods, if the S1 dip were a real 8 ppt, 6 h transit of the target.**
  * Shortest allowed P: 228 d.
  * Allowed fraction of periods: 0% below 100 d, 0.3% of 100–300 d, 21% of 300–1000 d and 74% of 1000–3000 d.
  * Of (3028.91 − 1329.011)/n, only n = 1 (1699.9 d) and n = 3 (566.6 d) are allowed.
* **Not applicable.** Odd/even and secondary-eclipse tests are moot, since neither event is on the target.
* **Variability.** The vet reports 12–13 h signals of 1.3–1.8 ppt ("pulsations"); we did not re-examine them.

## 6. Face-value fits (`data/step6_fit_s1.json`, `data/step6_fit_s63.json`)

* **Setup.** batman fits within ±1 d with a quadratic baseline, P fixed at 1700 d, circular orbit, LD (0.32, 0.25).
* **S1 (QLP KSPSAP).** k = 0.101 (10.2 ppt), b ≈ 0.8, T14 6.0 h. ρ★ 3–32 ρ☉ within Δχ² < 4, with Δχ² = 15 at the Gaia 0.69 ρ☉. White-noise Δχ² against a flat line is 37.
* **S63 (QLP DET).** k = 0.100, b ≈ 0.9, T14 14.8 h. ρ★ 0.3–20 ρ☉ (consistent with the star).
* **Duration comparison.** A central transit at P = 1700 d and the catalogue density would last 27 h. The two events' durations (6.0 vs 14.8 h) are inconsistent for one body on one orbit unless both are grazing at different chords, which cannot happen.
* **Caveat.** These fits describe QLP's flux, which §2–4 show is not the target's.

## 7. Prior knowledge

* **ExoFOP:** no TOIs, CTOIs, imaging, spectroscopy, time series, stellar companions or notes. Names: 2MASS J05280936-6156307, UCAC4 141-005706, APASS 29838544, WISE J052809.35-615630.6.
* **TOI and CTOI lists:** absent (8152 and 5140 lines).
* **AAVSO VSX** (72″): no objects.
* **SIMBAD:** UCAC4 141-005706 (type `*`), with GALAH DR3 and one 2022 MNRAS reference (2022MNRAS.517.5325H). No variability or binarity entries.
* **VizieR:** unreachable (CfA 502; CDS and IUCAA time out), so the TESS EB catalogue and the Gaia classifier were not checked there. Gaia NSS and vari tables were queried directly: no entries.

## What would change the verdict

* **On the target:** a clean ≳5 ppt, ~6 h dip in a sector without scattered-light gradients, confirmed in a small (≤1.5 px) aperture and with no matching dip on other stars on the CCD. The ephemeris predicts transits on 2027-11-19 (P = 1700 d) or 2026-11-18 + n × 566.6 d (P/3).
* **On TIC 149217623 (the lead):** seeing-limited ground photometry that resolves the 42″ pair at a predicted epoch, or a TESS sector without strong background gradients that shows a ~1–2%, 9–15 h dip on that star. It is a T 15.2 M dwarf, so a 1–2 m telescope would be needed.

## Not checked

* Gaussian-process or CBV models of the S1 scattered light.
* TESScut photometry of any sector other than S1 and S63.
* The vet's 12–13 h "pulsation" signals.
* QLP or TGLC light curves of TIC 149217623 itself (none was found among the searched products).
* VizieR catalogues; ASAS-SN and ATLAS light curves.

## Pipeline note

1. **Run the same-CCD common-mode check on every QLP event.** At S63, 23 of 25 stars dip together, with depth ∝ 1/flux: a background over-subtraction during scattered-light decline. A rule such as "flux-scaled common mode ≥ 30% of the event depth ⇒ artifact" would have caught it.
2. **Score the aperture test from the pixels.** Our TESScut depth rose from ~1 ppt (r = 1) to 5–11 ppt (r = 3). QLP's 2.4× large/small ratio, which the vet left unscored, was pointing at the same thing.
3. **Don't upgrade a single event to a period from a weak "recovery".** The 3028.91 recovery falls in a high-background stretch and has a duration inconsistent with the first event (14.8 vs 6.0 h). Require matching durations and an independent reduction first.
4. **Check pipeline agreement in early sectors.** For S1 at the CCD edge, eleanor and TASOC both disagree with QLP. The vet's "pipelines" flag was right and should weigh more.

## Files

Run the scripts with `../.venv/bin/python -W ignore <script>` from this folder.

* **Helpers:** `cfg.py`, `lcio.py` (adds TASOC/TGLC/T16), `measure.py`.
* **Scripts:** `step1_products.py`, `step1_tic.py`, `step1_gaia.py`, `step1_download.py`, `step1_tesscut.py` (args: 1 63), `step2_look.py`, `step2_archival.py`, `step2_own_phot.py` (args: 1 1329.011 / 63 3028.91), `step3_flags.py`, `step3_neighbors.py` (args: 1 1329.011 4 / 63 3028.91 3), `step4_diffimage.py`, `step4_nbphot.py`, `step5_search.py`, `step6_fit.py`, `step7_catalogs.py`.
* **Figures (`figs/`):** `raw_window_1329.png`, `raw_window_3029.png`, `own_phot_s1.png`, `own_phot_s63.png`, `diffimage_s1.png`, `diffimage_s63.png`.
* **Data (`data/`):** `tic.json`, `tic_60arcsec.csv`, `gaia_target.json`, `gaia_2arcmin.csv`, `gaia_nss_vari.json`, `step2_archival.json`, `step2_own_phot_s1.json`, `step2_own_phot_s63.json`, `step3_flags.json`, `step3_neighbors_s1.json`, `step3_neighbors_s63.json`, `step4_diffimage_s1.json`, `step4_diffimage_s63.json`, `step4_nbphot.json`, `step5_search.json`, `series.npy`, `step6_fit_s1.json`, `step6_fit_s63.json`, `step7_catalogs.txt`, `exofop.json`, plus the downloaded FITS files (`lc/`, `lc_neighbor/`, `tesscut/`).
