# TIC 425084139 (Sk −67 171): follow-up of the single-transit find (BTJD 2136.588, S30)

Analysis run 2026-11-02. It uses public data only: MAST (23 SPOC 2-min sectors S27–97, 16 TESS-SPOC, 34 QLP, the S30 and S39 2-min target pixel files, TESScut for S30, S39 and S90, and 15 other S30 2-min light curves on camera 4 CCD 2), TIC 8.2, Gaia DR3 (ESA archive), SIMBAD (CfA mirror), the AAVSO VSX API, the OGLE-IV LMC eclipsing-binary collection, and ExoFOP (target JSON plus the TOI and CTOI lists, read only). Nothing was submitted anywhere.

## Verdict: **noise/systematic artifact.** The dip is a ~1–3 ppt notch in the stochastic variability of an LMC B8 supergiant, at a momentum dump, deepened by PDC. It is not a planet in any interpretation

**The host is not a dwarf.** It is **Sk −67 171**, spectral type **B8Ia** (Evans+2006), a member of the LMC cluster NGC 2004 (Cl* NGC 2004 ELS 7).

| Evidence | Value |
|---|---|
| SIMBAD radial velocity | **+309.8 ± 0.8 km/s** (2023A&A...676A..85S), the LMC velocity |
| Gaia DR3 parallax / proper motion | −0.036 ± 0.021 mas; (1.649, 0.468) mas/yr, the LMC motion |
| Gaia ESP-HS | type B, Teff 14.9 kK, **logg 2.50**, A_G 0.41 |
| Luminosity and size | M_G = −6.8, log L ≈ 5.0–5.1, **R★ ≈ 55–65 R☉**, M ≈ 20 M☉ |
| Gaia variability | phot_variable_flag VARIABLE; vari_classifier **ACYG** (α Cyg variable); G range 0.053 mag |

The TIC has no radius, and its d = 9.4 kpc comes from a negative parallax. VSX lists the star as an ACYG variable, which is the vet's "already catalogued" flag.

**Five findings decide it:**

1. **The dip is small in raw flux, and PDC deepens it.** In S30 (6 h trapezoid, ±1 d quadratic baseline):
   * SPOC SAP gives 2.64 ± 0.80 ppt, TESS-SPOC SAP 2.93 ± 0.79, TESS-SPOC PDCSAP 2.27 ± 1.06, and our TESScut r = 1.5 / 2.5 px gives 2.6 ± 0.8 / 1.45 ± 0.94.
   * Only SPOC 2-min PDCSAP gives 6.3 ± 1.4 ppt.
   * QLP has no good cadences between 2136.1 and 2136.9, so its numbers do not cover the event.
2. **It ends at a momentum dump (2136.753–2136.761).**
   * Before the dump, the row centroid drifts down by 0.002 px and jitter rises to 6–7 mpx, against 3.5 mpx after (in/out ratio 1.39). The flux then steps up by about 1.5 ppt at the dump.
   * Measured against a per-pixel baseline from the pre-dump side only, the event deficit is **0.14 ppt** of the aperture flux. With both sides, it is 3.2 ppt.
3. **The same epoch dips on other stars.** Of 15 other S30 2-min stars on the same CCD (T 9.9–13.0, within 0.2°), **7 show a > 2σ SAP "dip"**: median 1.1 ppt, weighted mean 0.72 ± 0.13 ppt. For 7 of them the dip falls in the deepest 2% of their own sector. That is a CCD-wide SAP systematic at this time. In PDCSAP the same stars give −0.14 ± 0.10 ppt: PDC removes the common mode from them but over-corrects the target.
4. **The star's own red noise makes dips like this all the time.**
   * The amplitude spectrum is a stochastic low-frequency profile: α₀ 1.14 ppt, ν_char 0.58 c/d, γ 5.0. The highest peak moves between 0.18 and 0.42 c/d from sector to sector. PDCSAP rms is 4.3–6.5 ppt in every sector.
   * The vet's "pulsations" (60–70 h) and its "4.77 d" are pieces of this.
   * Over 23 sectors, the event ranks **11th of 1097** independent 6 h dips in SAP (10 deeper, up to 5.3 ppt) and 4th of 1104 in PDCSAP.
   * Phase-randomised surrogates with the star's power spectrum make a deepest dip of 9.8 ppt (median of 200). So 2.5 ppt is ordinary.
5. **Even a real eclipse could not be a planet.**
   * 2.6–7.4 ppt on a 60 R☉ star needs a body of **3.1–5.2 R☉ (30–50 R_J)**.
   * A central transit at the vet's P = 1635.6 d or its aliases (409–818 d) would last **318–505 h**. A 6 h event needs b ≈ 1.07, a tangent graze.

**The vet's two "repeats" are not real.**
* **2389.59** is in the last 0.13 d of S39. It is seen only in SPOC PDCSAP (4.5 ± 1.7 ppt). It is absent from SPOC SAP (0.19 ± 0.99), TESS-SPOC SAP and PDCSAP (0.65 ± 0.94, 0.60 ± 1.17) and our TESScut photometry (0.3 ± 0.9).
* **3772.15** (S90 has no 2-min data) is seen in QLP DET_FLUX (9.3 ± 1.7). It is not confirmed by QLP SAP (8.9 ± 5.6) or our TESScut photometry (−6.4 ± 6.5, r = 1.5 px).
* The 1635.6-d period is meaningless.

## Status of each step

| # | Step | Status |
|---|---|---|
| 1 | Host: TIC, Gaia DR3 (astrometry, ESP-HS, vari, NSS), SIMBAD, LMC membership, neighbour NSS | **verified**: LMC B8Ia supergiant, R ≈ 60 R☉; RUWE 0.94; no NSS for it or any G < 17.5 star within 2′ |
| 2 | Depth in SPOC SAP/PDCSAP, TESS-SPOC, QLP, own TESScut and TPF photometry at 6 apertures | **verified**: about 2.6 ppt in all raw fluxes; 6.3 ppt only in SPOC PDCSAP |
| 3 | Flags, dumps, jitter, centroid, background, 15 same-CCD stars | **verified**: a momentum dump at the egress, raised jitter, and a common-mode SAP dip on 7/15 stars |
| 4 | TPF deficit image, aperture growth, variability location | **run**: the deficit depends on the baseline (3.2 ppt with both sides, 0.14 ppt pre-dump only). The variability is on the target PSF (correlation 0.93 with the star image) |
| 5 | All sectors: repeats, red-noise ranking, surrogates | **verified**: no real repeat; the event is rank 11/1097 in SAP |
| 6 | Size, durations, batman fit | **run**: ≥ 3 R☉ body, grazing only. A face-value batman fit (P 1635.6 d) gives k 0.27, b 1.08, ρ★ 266× the supergiant's |
| 7 | ExoFOP / TOI / CTOI / VSX / SIMBAD / OGLE | **run**: no TOI, CTOI, imaging or spectra; VSX ACYG; SIMBAD B8Ia; nothing in OGLE-IV EB/ELL within 10″ |

---

## 1. Host star (`data/tic.json`, `data/step1_gaia.txt`, `data/step7_catalogs.txt`, `data/step6_size.json`)

| Quantity | Value |
|---|---|
| Names | Sk −67 171, TYC 8891-3385-1, Cl* NGC 2004 ELS 7, Gaia DR3 4660132807190729728 |
| SIMBAD | B8Ia (2006A&A...456..623E); type s*b; RV 309.8 ± 0.8 km/s; V 12.09, B 12.05, J/H/K 12.00/12.02/12.00 |
| Gaia DR3 | G 12.068, BP−RP 0.010; ϖ −0.036 ± 0.021 mas; μ (1.649 ± 0.023, 0.468 ± 0.028) mas/yr; RUWE 0.94; ipd multi-peak 0; non_single_star 0; no Gaia RV |
| Gaia ESP-HS | Teff 14864 ± 166 K, logg 2.50, A_G 0.41, vsini 3 ± 16 km/s |
| Gaia variability | 48 FoV transits; G std 0.011 mag, range 0.053 mag; best class ACYG (score 0.25) |
| Derived (DM 18.48, BC −0.85 to −1.25) | M_G −6.82; log L 4.96–5.12; R 55–65 R☉ (adopt 60); M ≈ 20 M☉ (logg gives 41); ρ★ ≈ 9×10⁻⁵ ρ☉ |
| TIC 8.2 | Tmag 12.19; d 9446 pc (negative DR2 ϖ); no Teff, R or M |

* **Neighbours.** No Gaia source lies within 4″. Within 1′ the brightest are G 16.4–17.3 (10–30″) and G 14.71 at 37″. SPOC CROWDSAP is 0.875 in S30.
* **The vet's neighbour list.** It needs 18–75% eclipses of these stars. The location test is moot because the dip itself is not established (§4).

## 2. Depths (`data/step2_archival.json`, `data/step3_repeats.json`, `data/step4_pixels.json`)

`measure.py`: a 6 h trapezoid at 2136.588 on a ±1 d quadratic baseline, quality = 0 cadences only.

| Product (S30) | Depth [ppt] | β |
|---|---|---|
| SPOC SAP / PDCSAP | 2.64 ± 0.80 / **6.32 ± 1.42** | 2.5 / 3.8 |
| TESS-SPOC SAP / PDCSAP | 2.93 ± 0.79 / 2.27 ± 1.06 | 2.2 / 2.4 |
| QLP SAP / KSPSAP | no quality = 0 cadences in the event (gap 2136.1–2136.9) | |
| Own TESScut, r = 1.5 / 2.5 px | 2.60 ± 0.83 / 1.45 ± 0.94 | |
| Own TPF, r = 1–4 px, background-subtracted | 3.1–4.0 ± 0.8–1.0 (raw falls from 3.2 to 1.6) | |

The vet's "pipeline flux 7.13 ppt" is the PDCSAP value. Its "raw SAP 4.56 ± 2.62" also included S90.

## 3. Systematics (`data/step3_flags.json`, `data/step3_neighbors.json`, `figs/step3_flags.png`)

* **Momentum dump.** At 2136.753–2136.761, 0.17 d after mid-event, just after egress. 96% of event cadences have quality = 0; 7 carry flag 128.
* **Pointing.** Jitter is 6–7 mpx through the event and 3.5 mpx after the dump (in/out ratio 1.39). The row centroid drifts by −0.002 px before the dump and jumps back after it.
* **Background.** It changes by +0.14 e⁻/s against 1217 e⁻/s, which is negligible.
* **15 other S30 2-min stars** (camera 4 CCD 2, 0.09–0.21°). See finding 3 above: in SAP, 12 of 15 are positive and 7 are > 2σ (weighted mean 0.72 ± 0.13 ppt). In PDCSAP only 1 is > 2σ.

## 4. Pixels (`step4_pixels.py`, `data/step4_pixels.json`, `figs/step4_pixels.png`)

* **Deficit image** (in = |t − TC| < 2.8 h, per-pixel linear baseline over ±0.7 d).
  * With baseline cadences on both sides: 3.2 ppt of the aperture flux, star-shaped (correlation 0.65 with the star image).
  * With pre-dump baseline cadences only: 0.14 ppt, with no structure. The "dip" exists only relative to the post-dump level.
* **Variability.** It sits on the target's PSF: per-pixel amplitude/flux = 1.00 in the aperture, correlation 0.93 with the star image. It is the supergiant's own.

## 5. All sectors (`data/step3_variability.json`, `data/step5_surrogates.json`, `data/step3_repeats.json`)

* **Dip ranking** (same 6 h statistic slid every 0.05 d over 23 SPOC sectors):
  * SAP: rank 11 of 1097. Deeper dips include S38 2346.02 (5.3 ppt) and S36 2299.71 (3.9 ppt).
  * PDCSAP: rank 4 of 1104.
  * The white-noise "SNR" of ordinary troughs is 7–18, so SNR means nothing here.
* **Per-sector deepest SAP dip.** 1.7–5.3 ppt. In S30 it is the event at 2.52 ppt, but 5 other sectors have deeper ones.
* **Surrogates.** 200 phase-randomised realisations of all 23 SAP sectors give a deepest dip of 9.8 ppt (median) and 12.2 ppt (95th percentile). The real data's 5.3 ppt maximum, and so the 2.5 ppt event, are well inside. Per sector, P(deepest ≥ 5.3 ppt) = 0.14.
* **Repeats.** See the verdict: neither of the vet's repeats survives raw photometry.

## 6. Size and duration for the real star (`data/step6_size.json`)

| Quantity | Value |
|---|---|
| R★ / M★ adopted | 60 R☉ / 20 M☉ |
| Body for 2.6 / 5.4 / 7.4 ppt | 3.05 / 4.4 / 5.15 R☉ (30 / 43 / 50 R_J) |
| Central T14 at P = 409 / 545 / 818 / 1636 d | 318 / 350 / 401 / 505 h |
| b needed for a 6 h chord | 1.07 at every P |
| Face-value batman fit (SAP, P 1635.56 d) | k 0.27, b 1.08 (grazing), ρ★ 0.025 ρ☉ = 266× the supergiant's |

## 7. Catalogs (`data/step7_catalogs.txt`, `data/exofop.json`, `data/step7_ogle.json`)

* **ExoFOP.** No TOIs, CTOIs, imaging or spectroscopy. Not in the TOI or CTOI lists.
* **AAVSO VSX API, 72″.** The target is an ACYG variable (Gaia DR3). Others: an RRAB (G 18.9, 82″), an EB at P 22.3 d (G 19.8, 30″) and an EB at P 0.262 d (G 14.7, 37″, Gaia DR3 4660132875910215808).
* **OGLE-IV.** The nearest EB/ELL is ELL-04012 at 36″ (I 15.9, P 136.5 d). Next is ECL-51231 at 46″ (I 14.9, P 28.4 d).
* **VizieR.** Unreachable (CfA 502, CDS timeout).

## What would change the verdict

* A transit-like 6 h dip of ≥ 3 ppt in raw (SAP or own) photometry at an epoch with no momentum dump, no common-mode signal on other stars, and an SAP rank in the top 1–2 of the star's red-noise distribution.
* Even then, a 60 R☉ host rules out a planet. Only a grazing stellar companion would remain.

## Not checked

* VizieR catalogues: TESS EB and the OGLE-III LMC lists.
* QLP's reason for dropping 2136.1–2136.9.
* S90 in 2-min data (none exists).
* The surrogates' over-production (real max 5.3 ppt against a surrogate median of 9.8) means the phase randomisation, which keeps the non-stationary trends, is conservative. It was not refined.

## Pipeline notes

1. **Reject non-dwarf hosts before the single-event search.** Use Gaia ESP-HS logg < 3.5, ϖ/σ < 1 with LMC proper motion, or SIMBAD luminosity class I. This star is a catalogued B8Ia ACYG variable.
2. **Use SAP, not PDCSAP, for depth on variable stars.** Here PDC more than doubled the depth (2.6 → 6.3 ppt) and created the S39 "repeat".
3. **Flag events within ~0.2 d of a momentum dump, and test same-epoch SAP dips on other stars on the CCD.** Here 7/15 dipped.
4. **Calibrate single-event significance against the star's own red-noise distribution.** Rank 11/1097 should not pass.

## Files

* **Scripts:** `step1_tic.py`, `step1_gaia.py`, `step1_products.py`, `step1_download.py`, `step2_look.py`, `step2_archival.py`, `step3_flags.py`, `step3_neighbors.py`, `step3_repeats.py`, `step3_variability.py`, `step4_pixels.py`, `step5_surrogates.py`, `step6_size.py`, `step7_catalogs.py`, `step7_ogle.py` (reads the OGLE files in `../tic425083302/data/ogle/`), plus `lcio.py`, `measure.py` and `common.py`. Run them with `../.venv/bin/python -W ignore` from this folder. (`step5_surrogates.py` prints "8h dip" but uses the 6 h DUR from `common.py`.)
* **Figures (`figs/`):** `step2_window_s30.png`, `step2_all_spoc.png`, `step3_flags.png`, `step3_variability.png`, `step4_pixels.png`.
* **Data:** `data/` (JSON and text outputs; light curves in `data/lc`, TPFs in `data/tpf`, cutouts in `data/tesscut`, neighbour light curves in `data/nbr`).
