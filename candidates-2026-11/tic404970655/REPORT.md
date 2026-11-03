# TIC 404970655 (OGLE LMC-ECL-37031): follow-up of the single-transit find (BTJD 2155.565)

Analysis run 2026-11-02. It uses public data only: MAST (11 SPOC 2-min sectors S28–39, 11 TESS-SPOC, 39 QLP, the S30–32 2-min target pixel files), Gaia DR3 (ESA archive), the OGLE-IV Collection of Variable Stars (LMC eclipsing binaries, Glowacki et al. 2025, with its I/V photometry), SIMBAD (CfA mirror), the AAVSO VSX API, and ExoFOP (read only). Nothing was submitted anywhere.

## Verdict: **eclipsing binary (on target).** The dip is the primary eclipse of OGLE LMC-ECL-37031, a known detached, eccentric eclipsing binary in the LMC with P = 20.1104 d. TESS shows the same eclipses 36 times (primary) and 37 times (secondary)

**The host is not a dwarf.** It is a hot, luminous LMC star. The TIC entry is broken.

| Evidence | Value |
|---|---|
| Gaia DR3 parallax | 0.009 ± 0.015 mas, consistent with the LMC's 0.020 mas |
| Gaia DR3 proper motion | (1.888, 0.693) mas/yr, the LMC motion |
| Gaia temperature and gravity | GSP-Phot 24.5 kK; ESP-HS spectral type **B**, 20.6 kK, **logg 2.44** |
| Luminosity and size (combined light) | M_G ≈ −5.9, log L/L☉ ≈ 5.0–5.2, R ≈ 23–26 R☉ if it were one star |
| TIC 8.2 (wrong) | Tmag 12.26 ± 0.6 (G is 13.29, BP−RP 0.04), d 9951 pc from a negative DR2 parallax, no Teff, R or M |

**Four findings decide it:**

1. **It is a catalogued eclipsing binary.**
   * SIMBAD's main identifier for the star is OGLE LMC-ECL-37031 (type EB*).
   * The OGLE-IV catalogue gives a non-contact system with **P = 20.1104183 d**, primary epoch HJD 2460000.2755, and I-band depths of **0.087 mag (primary) and 0.062 mag (secondary)**.
   * OGLE's 705 I-band points over 14.2 yr fold cleanly, with the secondary at **phase 0.323**.
2. **The sweep event is a primary eclipse.**
   * The OGLE ephemeris, propagated back 42 cycles, predicts a primary at BTJD 2155.638. The S31 minimum is at 2155.642.
   * The vet's "second transit" at 2162.10 and its "secondary at 2162.01" are the OGLE secondary eclipse, predicted at 2162.138.
3. **The eclipses repeat in every TESS sector.** Every predicted eclipse that has TESS data shows the dip: 36 primaries (14 SPOC, 22 QLP; median 35 ppt in SAP) and 37 secondaries (14 SPOC, 23 QLP; median 29 ppt) over S28–S98.
   * Folded SPOC SAP (S28–39): the primary is 41.1 ppt deep, about 28 h long and V-shaped. The secondary is 35.9 ppt deep and about 9 h long.
   * The secondary is 87% as deep as the primary. Its phase gives e cos ω = −0.27, and the unequal durations need e sin ω ≠ 0, so the orbit is eccentric (e ≳ 0.3).
   * A planet cannot make a 36 ppt secondary eclipse. Both bodies are luminous stars of similar surface brightness.
4. **The eclipse is on the target.**
   * In all three TPF sectors (S30–32), a Gaussian fit to the mean eclipse-deficit image lands **0.3–1.2″ from the Gaia position of the target**. The centre of the out-of-eclipse image sits 5.2–5.3″ away, pulled by the neighbours.
   * The Gaia sources nearest the deficit centre are G 19.5–20.9 at 2.4–4.7″. They are 6–7.6 mag fainter than the target, and no eclipse of theirs could produce a 4% deficit.
   * OGLE's photometry at about 1″ seeing shows the 0.09 mag eclipses directly at this position.

The sweep reported "16.3 ppt in 8 h" because it fit an 8 h box with a short baseline to a 28 h V-shaped eclipse.

## Status of each step

| # | Step | Status |
|---|---|---|
| 1 | Host: TIC, Gaia DR3 (astrometry, GSP-Phot, ESP-HS, variability, NSS of the target and of 68 neighbours with G < 17.3), SIMBAD, LMC membership | **verified**: LMC B-type star. There is no Gaia NSS solution or RV, and SIMBAD has no RV |
| 2 | Depth in SPOC PDCSAP/SAP, TESS-SPOC, QLP SAP/KSPSAP; own TPF photometry at several apertures | **verified**: every product shows the eclipse. The vet's "QLP 0.386 ppt" is because QLP flags (bit 4096) all of 2155.50–2158.94 |
| 3 | Flags, dumps, background, jitter | **verified**: no flags, no momentum dump within 4.7 d, no centroid motion. Same-CCD stars were not checked: they are not needed, because the eclipses repeat on a 14-yr OGLE ephemeris |
| 4 | Difference images (S30, S31, S32), Gaia neighbours | **verified**: on target to within 1.2″ |
| 5 | All sectors: repeats, secondary, period | **verified**: 36 primaries and 37 secondaries at the OGLE period; secondary at phase 0.322 |
| 6 | Shape and size | **run**: V-shaped 28 h primary, 9 h secondary, depth ratio 0.87. A dark body would need ≥ 3–5 R☉ (30–48 R_J). The companion is a star |
| 7 | ExoFOP / TOI / CTOI / VSX / SIMBAD / OGLE | **verified**: no TOI or CTOI. VSX lists only the Gaia short-timescale "VAR". SIMBAD and OGLE list it as an EB |

---

## 1. Host star (`data/tic.json`, `data/step1_gaia.txt`, `data/step1_gaia_nbr.txt`, `data/step1_simbad.txt`, `data/step6_size.json`)

| Quantity | Value |
|---|---|
| Names | OGLE LMC-ECL-37031, OGLE LMC552.24.36005, 2MASS J05411346-7029348, Gaia DR3 4657168592571177984 |
| SIMBAD | type EB*; no spectral type, no RV; 7 references, all catalogues |
| Photometry | G 13.29, BP−RP 0.035; U/B/V 12.43/13.31/12.88; OGLE I 13.26 and V 13.32 at maximum; J/H/K 13.31/13.33/13.31 |
| Gaia DR3 astrometry | ϖ 0.0089 ± 0.0150 mas, μ (1.888, 0.693) mas/yr, RUWE 0.86, ipd_frac_multi_peak 0, ipd_gof_harmonic_amplitude 0.028, non_single_star 0 |
| Gaia GSP-Phot | Teff 24.5 kK, logg 4.14, A_G 0.80, R 4.45 R☉ at its (wrong) 9.5 kpc, which is **23 R☉ rescaled to 49.6 kpc** |
| Gaia ESP-HS | type B, Teff 20.6 kK, **logg 2.44**, A_G 0.67 |
| Gaia DSC | "white dwarf" with probability 1.0 in combmod and specmod. This is a known DSC failure for distant, reddened hot stars, and the luminosity rules it out |
| Gaia variability | phot_variable_flag VARIABLE. Only vari_short_timescale has an entry (39 FoV transits, amplitude 0.044 mag, "frequency" 67.07 c/d), and that frequency is the source of VSX's "VAR, P 0.0149099 d". There is no vari_eclipsing_binary entry: Gaia's 39 epochs missed the narrow eclipses |
| Derived (DM 18.477, BC −2.0 to −2.35) | M_G −5.85 to −5.98, log L 5.04–5.23, combined R 23–26 R☉ |
| TIC 8.2 (wrong) | Tmag 12.2589 ± 0.6, d 9951 pc (ϖ_DR2 −0.023), no Teff, R or M. The SPOC S31 aperture flux (1158 e⁻/s, FLFRCSAP 0.79, CROWDSAP 0.75) implies T ≈ 12.9 |

**Neighbours.** Gaia has 2842 sources within 2′, 68 of them with G < 17.3.
* None has an NSS orbit or acceleration solution, and none is a Gaia EB.
* Four have Gaia variability classes, all at 92–119″ (two BE|GCAS|SDOR|WR and two LPV).
* The brightest within 30″ is G 14.70 at 22.7″, a foreground star (ϖ 0.80 mas, μ (10.2, 4.7) mas/yr).

## 2. Depths (`data/step2_archival.json`, `figs/step2_window_s31.png`)

S31, `measure.py` (trapezoid, per-segment quadratic baseline, red-noise error):

| Product | Sweep 8 h box at 2155.565 (±1 d) | Secondary 8 h box at 2162.14 (±1 d) |
|---|---|---|
| SPOC PDCSAP / SAP | 30.9 ± 8.9 / 22.1 ± 5.8 ppt | 33.6 ± 3.5 / 25.4 ± 2.7 ppt |
| TESS-SPOC PDCSAP / SAP | 35.2 ± 9.6 / 23.2 ± 6.0 ppt | 44.8 ± 4.6 / 26.5 ± 2.7 ppt |
| QLP SAP / KSPSAP | no data (flagged 2155.50–2158.94) | 18.6 ± 1.6 / 4.8 ± 2.3 ppt |

* **Window too short.** The ±1 d window is shorter than the 28 h primary, so these numbers undercount it. The folded primary is 41.1 ppt in SAP (§6).
* **Pipeline disagreement.** QLP's S31 light curve has no good cadences from 2155.50 onward, so it never sees the primary minimum. KSPSAP is high-pass filtered and suppresses even the 9 h secondary, to 4.8 ppt. The vet's "QLP 0.386 ppt" compares a flagged, filtered product with SPOC; it is not a real disagreement.
* **Detrending sensitivity.** The depth changes with the detrending window because the eclipse is longer than every window tried (0.8–2.3 d running medians, 1.7 d quadratic).
* **Uniqueness.** The "brightening at 2156.32" is the eclipse egress, where the flux recovers by about 40 ppt over 0.7 d, measured against a baseline fitted through the eclipse.
* **Own TPF photometry** (§4). In S31 the mean eclipse deficit is 4.2 / 3.4 / 2.8 / 1.9 / 1.3% in apertures of r = 1 / 1.5 / 2 / 3 / 4 px. It falls as the neighbours' light is added.

## 3. Systematics (`data/step3_flags.json`)

* **Quality flags.** There are none in the event window; 100% of the SPOC cadences there have quality 0.
* **Momentum dumps.** They are at 2144.51, 2150.92, 2158.86 and 2165.40. The nearest is 4.7 d after the event.
* **Background.** SAP_BKG is 2015 e⁻/s summed over the aperture, against 1158 e⁻/s from the star; the H II region DEM L 291 is 12″ away. During the event the background is 150 e⁻/s *lower* than around it. Mis-subtracting that would make the star look brighter, not fainter.
* **Centroid.** The shift in minus out is −0.003 px in both axes.
* **Moot.** None of these checks matters here, because the eclipses recur at the OGLE ephemeris in 14 TESS sectors over 6 years.

## 4. Location (`data/step4_diffimage.json`, `figs/step4_diffimage.png`)

| Sector | Eclipses stacked | Deficit centre vs Gaia target | Out-of-eclipse centre vs target | Nearest other Gaia source to the deficit |
|---|---|---|---|---|
| S30 | 2 (P + S) | **1.2″** | 5.3″ | G 20.86 at 2.5″ |
| S31 | 2 (P + S) | **0.7″** | 5.3″ | G 19.48 at 2.4″ |
| S32 | 3 (2P + S) | **0.3″** | 5.2″ | G 19.48 at 2.8″ |

In every sector the deficit is a compact PSF (σ 0.6–0.7 px) centred on the target. The vet's neighbour list (G 14.2–15.4 stars at 16–36″, needing 26–69% eclipses) is excluded by more than 15″.

## 5. All sectors (`data/step5_ogle.json`, `data/step5_tess_eclipses.json`, `figs/step5_ogle.png`, `figs/step5_tess_eclipses.png`)

* **OGLE-IV I band** (705 points, HJD 2455262–2460457).
  * Primary points reach 0.094 mag below the median and stay more than 0.02 mag down for about 20 h.
  * Secondary points reach 0.082 mag at phase 0.3145–0.3275, over about 6.3 h.
  * A box-sum period refinement gives 20.11029 d, within 0.0001 d of the catalogue value.
* **TESS.** Each OGLE-predicted time was measured as the minimum of 1-h bins against a linear baseline 0.6–1.6 d away.

  | Eclipse | Covered | Depth range [ppt] | Median depth [ppt] | Median offset from OGLE prediction |
  |---|---|---|---|---|
  | Primary | 36 | 18–72 | 35 | −2.9 h |
  | Secondary | 37 | 14–69 | 29 | −0.9 h |

  * The small, steady offsets are what a period error of about 0.0001 d, or apsidal motion, would produce over 40–50 cycles. They were not modelled.
  * QLP depths change between sectors: about 25 ppt in S61–93 and 50–70 ppt in S95–98, as QLP's dilution and background change. SPOC stays at 35–58 ppt.
* **Why the vet saw "one transit" and "repeats that don't fit one period."**
  * It searched for an 8 h box at 36.8 ppt. The primaries are 28 h long and V-shaped, so most of them fall below that template.
  * The secondary does match the template, but it sits at phase 0.32. A primary plus a phase-0.32 secondary cannot be put on one period without predicting events that aren't there.
* **The "ASAS-SN P = 415.68 d" is spurious.** It is not an integer multiple of 20.11 d (it is 20.67 ×), and it rests on 4 in-eclipse points. The OGLE period explains every TESS and OGLE eclipse.

## 6. Shape and size (`data/step6_fold.json`, `data/step6_size.json`, `figs/step6_fold.png`)

| Quantity | Value |
|---|---|
| Folded SPOC SAP S28–39 (2 d running median, eclipses masked) | primary 41.1 ppt, about 28 h (width at 10% of the depth), V-shaped; secondary 35.9 ppt, about 8.9 h |
| TESS phases | primary −0.0054 (−2.6 h vs OGLE), secondary 0.3218 |
| Orbit | e cos ω = −0.271. The duration ratio needs a large \|e sin ω\| (first-order estimate −0.5), so e ≳ 0.3 |
| Size if the body were dark | 3.1 / 4.7 / 4.9 R☉ for 16.3 / 36.8 / 41.1 ppt (30–48 R_J), on R ≈ 24 R☉ |
| Scale | M_tot ≈ 30 M☉ gives a ≈ 97 R☉. The 28 h primary chord is consistent with stars of about 10–20 R☉ |

No transit fit was done. A planet model cannot reproduce a secondary eclipse 87% as deep as the primary, and the density test is moot for an EB.

## 7. Catalogs (`data/step7_catalogs.txt`, `data/exofop.json`, `data/ogle/catalog_lines.txt`)

* **ExoFOP.** No TOIs, CTOIs, imaging, spectroscopy or companions. The star is not in the TOI list (8152 lines) or the CTOI list (5140 lines).
* **SIMBAD (20″).** The target is OGLE LMC-ECL-37031 (EB*). Also within 20″: the H II region DEM L 291 (12″) and the long-period variables OGLE LMC-LPV-79595 (16″) and -79489 (19″).
* **AAVSO VSX (72″).**
  * The target appears only as "Gaia DR3 4657168592571177984, VAR, P 0.0149099 d", taken from Gaia's short-timescale table.
  * Four faint Gaia variables (G 18.8–19.3) lie 13–46″ away.
  * VSX does not carry the OGLE EB designation.
* **OGLE-IV LMC eclipsing binaries.** OGLE-LMC-ECL-37031: NC; I 13.258, V 13.319; P 20.1104183 d; T0 HJD 2460000.2755; depths 0.087/0.062 mag; OGLE-IV ID LMC552.24.36005, OGLE-III ID LMC_SC18_74770. Only the catalogue lines and this star's I/V photometry were kept.

## What would change the verdict

Nothing. Four things together fix this as an on-target stellar eclipsing binary:
* the OGLE ephemeris;
* 73 TESS eclipses at that ephemeris;
* a secondary eclipse 87% as deep as the primary;
* a deficit image centred on the target.

## Pipeline notes

1. **Cross-match OGLE-IV (about 75 000 LMC/SMC EBs) and SIMBAD object types (EB*) in the "already catalogued" check.** The vet checked VSX and Gaia EBs, and neither lists this star as an EB. SIMBAD's main identifier did.
2. **Search for repeats with a duration-free or long template.** The 8 h box missed 35 of the 36 primaries, which last 28 h.
3. **Treat "a second event that doesn't fit one period" as a possible EB with an eccentric secondary.** Test that hypothesis before concluding "not one transiting body."
4. **Check QLP coverage at the event before comparing pipelines.** Never use KSPSAP depths for events longer than about 0.5 d.
5. **As for TIC 389364321, flag LMC/SMC giants before the search.** Reject hosts with ϖ/σ < 1, LMC proper motion and ESP-HS logg < 3.5 as "not a dwarf". Distrust TIC Tmag when e_Tmag = 0.6.

## Files

Scripts: `common.py`, `lcio.py`, `measure.py`, `step1_tic.py`, `step1_gaia.py`, `step1_gaia_nbr.py`, `step1_simbad.py`, `step1_products.py`, `step1_download.py`, `step2_look.py`, `step2_archival.py`, `step3_flags.py`, `step4_diffimage.py`, `step5_ogle.py`, `step5_tess_eclipses.py`, `step6_fold.py`, `step6_size.py`, `step7_catalogs.py`. Run them with `../.venv/bin/python -W ignore` from this folder.

Data: `data/lc/` (SPOC, TESS-SPOC, QLP), `data/tpf/` (S30–32), `data/ogle/` (catalogue lines and I/V photometry), plus the JSON and text outputs named above.

Figures (`figs/`): `step2_window_s31.png`, `step4_diffimage.png`, `step5_ogle.png`, `step5_tess_eclipses.png`, `step6_fold.png`.
