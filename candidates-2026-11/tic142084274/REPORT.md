# TIC 142084274: follow-up of a single-transit candidate (BTJD 1635.158, S12)

Analysis run 2026-11-01 on real TESS data from MAST (SPOC 2-min, TESS-SPOC FFI, QLP and GSFC-ELEANOR-LITE light curves, plus TESScut), Gaia DR3, SIMBAD (Harvard mirror), the AAVSO VSX API and the ExoFOP target page, all read-only. Nothing was submitted anywhere.

## Verdict: **systematic artifact**

The 22 ppt dip exists only in the QLP light curve. It is a background-subtraction error on a star that sits about 3 px from the edge of camera 4 CCD 1 in S12.

- **The dip is mostly one 30-min cadence.** At BTJD 1635.1368 QLP SAP reads −49.8 ppt, and QLP's own `SAP_BKG` is +2253 above its local median on that cadence. Without it the QLP depth is 9.8 ± 13.2 ppt.
- **QLP flux tracks QLP background.** Within ±1.5 d, r(flux, background) = −0.94. With the background regressed out, the depth is 2.4 ± 5.3 ppt.
- **The pixels show no 22 ppt event.** Own TESScut photometry (4 background methods × 3 apertures) gives 2.5–5.0 ppt (σ 1.3–4.8). A 22 ppt, 2 h transit injected into the same photometry is recovered at +21.9 ± 1.6 ppt (~13σ). GSFC-ELEANOR-LITE gives 1.8–6.8 ± 2.2–3.0 ppt.
- **QLP makes 10–30 ppt dips on this star that SPOC 2-min shows are not real:**
  - S27 2058.07: QLP 31.0 ± 5.7 vs SPOC 0.3 ± 1.2
  - S28 2071.43: QLP 12.3 ± 3.1 vs SPOC 1.3 ± 1.3
  - S90 3775.0: QLP 22.7 ± 6.1 vs SPOC SAP 1.2 ± 2.2
  - S89 3735.03: QLP 14.5 ± 2.0 vs own TESScut −1.4 ± 1.5
- **The shape does not fit a transit of this star.** The QLP feature is essentially one cadence. A batman fit wants ρ★ ≥ 600–1600 ρ☉, against the catalog 6.17; the catalog density is disfavoured by Δχ² ≈ 22–24.

The star is a real nearby M dwarf, but Gaia RUWE is 7.0, so it probably has an unresolved companion.

## Status of each step

| # | Step | Status |
|---|---|---|
| 1 | TIC + Gaia DR3 star properties, sectors, downloads | **verified** |
| 2 | Event in every reduction, plus injection | **verified**: present only in QLP |
| 3 | Systematics: flags, dumps, gaps, scattered light, CCD edge, 44 other stars on cam 4 CCD 1 | **verified**: QLP background error at the CCD edge |
| 4 | Difference image + Gaia neighbours | **run**: no flux loss in any pixel; nothing to localise |
| 5 | All-sector search for repeats/secondaries, allowed periods | **verified**: every deep dip is QLP- or eleanor-only and absent from SPOC |
| 6 | Shape / implied density, variability | **run**: inconsistent with a transit across this star |
| 7 | ExoFOP / TOI / CTOI, VSX, SIMBAD | **run**: nothing known. VizieR (CDS) timed out |

## 1. Star

**TIC 8.2:** Teff 3376 ± 157 K, R 0.398 ± 0.012 R☉, M 0.389 ± 0.021 M☉, ρ 6.17 ± 0.25 ρ☉, logg 4.83, Tmag 13.427, DWARF, in the cool-dwarf list, contratio 0.023. No distance in the TIC.

**Gaia DR3 5261603944288760576:**

| Quantity | Value | Comment |
|---|---|---|
| Parallax | 11.688 ± 0.110 mas → 85.6 pc | |
| G / BP−RP | 14.663 / 2.597 | |
| M_G / M_Ks | 10.00 / 6.35 | |
| Expected for a single dwarf at BP−RP 2.60 (Mamajek 2022, interpolated M3V–M3.5V) | M_G 10.34, M_Ks 6.75 | so the star is 0.3–0.4 mag over-luminous |
| Radius from M_Ks (Mann et al. 2015) | 0.39 R☉ | matches TIC |
| **RUWE** | **7.03** | |
| Astrometric excess noise | 1.21 mas (significance 483) | |
| ipd_gof_harmonic / ipd_frac_multi_peak | 0.018 / 0 % | |
| non_single_star | 0 | no entry in any NSS table |
| Variability tables | none | |
| RV | 53.9 ± 2.5 km/s (19 transits) | variability statistics not published (G_RVS 12.97) |
| DSC binary probability | 0.004 | |
| ESP-HS type | M | |

**Conclusion:** a genuine M3–M3.5 dwarf, but probably with an unresolved companion closer than ~1″. Any real transit depth would be diluted, and the host could be either star.

**Proper-motion note.** The TIC epoch-2000 position is 2.12″ from the Gaia epoch-2016 position (proper motion 133 mas/yr). The vet's "2″ neighbour, T 13.6" is the target itself.

## 2. The event in every reduction (S12, cam 4 CCD 1, 1800 s)

Method: 2 h trapezoid with a linear (or quadratic) baseline per segment within ±1 d. σ = max(white × β, empirical slid-fit scatter).

| Product | Depth [ppt] |
|---|---|
| QLP SAP (q=0) | 23.3 ± 13.2 (quad: 26.4 ± 13.8) |
| QLP KSPSAP (q=0) | 23.0 ± 7.7 (quad: 25.8 ± 8.3) |
| QLP SAP without cadence 1635.1368 | 9.8 ± 13.2 |
| QLP SAP, local background regressed out | 2.4 ± 5.3 (quad: 3.0 ± 6.5) |
| ELEANOR-LITE RAW / PCA / CORR (q ∈ {0, 128}) | 6.8 ± 3.0 / 4.7 ± 2.4 / 3.0 ± 2.2 |
| Own TESScut, r = 1.0 / 1.5 / 2.5 px × 4 backgrounds | 2.5–5.0, σ 1.3–4.8 (plane background, r = 1.5: 2.92 ± 1.27) |
| Comparison stars in the same cutout | 0.6–2.7 (the ~3 ppt level is partly common-mode) |

**Cadence by cadence:** every QLP outlier near the event lines up with a QLP background jump.

| Cadence | QLP flux | QLP background vs local median |
|---|---|---|
| 1635.1368 | −49.8 ppt | +2253 |
| 1635.1784 | −16.9 ppt | +743 |
| 1635.2618 | −22.2 ppt | +883 |
| 1634.9076 | −23.8 ppt | ≈ +1000 |

The same cadences in own photometry read −4.3 to +2.1 ppt, with a flat background of 75.0–75.5 e⁻/s/px.

**Injection:** a 22 ppt transit is recovered at 25.4 ± 1.6 ppt (+21.9 above native), and at +15–16 with ±0.02 d timing error.

**Noise:** QLP 2 h white σ is 6.4 ppt, against 1.5 ppt for own photometry; QLP is ~4× noisier. The vet's aperture ratio (12.4 vs 38.7 ppt) is also what a background error does.

Figures: `figs/raw_window_s12.png`, `figs/qlp_flux_vs_bkg.png`, `figs/own_phot_s12.png`.

## 3. Systematics

| Item | Value |
|---|---|
| CCD position | tess-point column 2090.3, row 597.0, EdgeWarn = 1. TESScut columns ≥ 14 read 0; target at column 10.2, ~3 px from the edge |
| Momentum dumps | 1634.366 and 1637.491: 0.79 d before and 2.33 d after. Not coincident |
| Gaps / sector edges | gap 1638.97–1640.05, sector 1624.97–1652.87. Event is mid-orbit |
| Scattered light | QLP bit 4096 is set on scattered single cadences around the event; the dip cadences are q = 0 in QLP. ELEANOR-LITE flags 1635.1368 and 1635.1784 with bit 128. Own-photometry background is flat |
| Other stars | 44 QLP stars on cam 4 CCD 1 within 1°: none > 3σ; median deviation at 1635.137 is −0.2 ppt. Edge-column stars (≥ 2087) have σ 2–55 ppt vs ~0.4–2.4 interior. TIC 142084295 (column 2091.1) shows the same +1966 background jump with −11.4 ppt (`figs/neighbors_s12.png`) |
| Variability | SPOC 2-min, 21 sectors: no coherent signal (LS power ≤ 0.007, semi-amplitude < 1.3 ppt). The vet's 8.16 h "pulsation" is absent. No flare near the event |

## 4. Difference image and Gaia neighbours

- Target pixel: 1.19 ± 0.52 e⁻/s of flux loss, against 4.66 expected for 22 ppt.
- r = 1.5 px sum: 3.1 ppt. Single-cadence difference image: 2.8 ppt.
- No pixel shows a 22 ppt-scale loss, so there is nothing to localise (`figs/diffimage_s12.png`).

**Gaia within 2′:** 55 sources.

| Source | Sep | G | Eclipse needed for 22 ppt | Notes |
|---|---|---|---|---|
| Gaia 5261604013008237056 | 12.7″ | 16.68 | ~14 % | plx 0.03 mas; = SIMBAD Pe* UCAC4 076-006381 |
| next stars | ≥ 51.7″ | 17.0–17.8 | ≥ 50–90 % | |

The r = 2.5 px aperture includes the 12.7″ star and shows 4.0 ± 3.3 ppt.

## 5. All TESS data: repeats, secondaries, allowed periods

**Coverage.** tess-point: 42 sectors on silicon (1–13, 27, 28, 30–39, 61, 63–69, 87–90, 93–97, camera 4), none after S97.

| Product | Sectors |
|---|---|
| SPOC 2-min (21) | 4, 5, 27, 28, 30–39, 87, 88, 90, 93–96 |
| TESS-SPOC (14) | 4, 5, 27, 28, 30–39 |
| QLP (40) | 1–2, 4–13, 27–28, 30–39, 61, 63–69, 87–90, 93, 95–97 |
| eleanor-lite (13) | 1–13 |
| TESScut | 45 sectors |

**Search** (1/2/3 h box, 0.75 d running-median detrend). SPOC and TESS-SPOC have no dip ≥ 7σ anywhere. Cross-checks of every deep dip found:

| Time (BTJD) | Pipeline-only depth | Independent check |
|---|---|---|
| S27 2058.07 | QLP 31.0 ± 5.7 | SPOC 0.3 ± 1.2, SAP 0.2 ± 1.2, TESS-SPOC 0.7 ± 1.2 |
| S28 2071.43 | QLP 12.3 ± 3.1 | SPOC 1.3 ± 1.3, TESS-SPOC −0.8 ± 1.4 |
| S90 3775.0 | QLP SAP 22.7 ± 6.1 | SPOC SAP 1.2 ± 2.2 (flagged cadences) |
| S89 3735.03 | QLP 14.5 ± 2.0 | own TESScut −1.4 ± 1.5 (injected 14.5 → 13.1 ± 1.5); target ~3 px from the row edge (EdgeWarn) |
| S12 1649.74 (brightening) | QLP −35 ± 15 | eleanor −0.2 ± 2.3 |
| S4 1411.08 | eleanor CORR 17.7 ± 6.0 | QLP −2.3 ± 1.7, SPOC −0.5 ± 1.5 |
| S10 1582.87, S3 1395.40, S9 1544.32, S5 1450.07, S11 1597.45 | eleanor only, σ 6–76 ppt, at flagged cadences or gap edges | not confirmed |

No repeat and no secondary eclipse exists in any reliable product.

**Allowed periods** for a hypothetical real 22 ppt, 2 h event:

| Data used | Shortest allowed P | Allowed 100–300 d | 300–1000 d | 1000–3000 d |
|---|---|---|---|---|
| SPOC + TESS-SPOC | 126.9 d | 3 % | 38 % | 88 % |
| + QLP | 268 d | — | — | — |

Allowed windows include 383–401, 459–481 and 766–1016 d; full list in `data/step5_periods.json`.

## 6. Shape and implied density

batman fit to QLP KSPSAP, circular, u = (0.30, 0.40), P = 130 / 400 / 648 / 1000 d, χ² profiled over (b, log ρ★).

- The best fit runs to the grid edge, 3162 ρ☉ (it wants a single-cadence event).
- Δχ² < 4 region: ρ★ ≥ 630 ρ☉ (P = 130 d) and ≥ 1600 ρ☉ (P ≥ 400 d). That is > 100× catalog.
- Forcing the catalog density costs Δχ² = 22–24, against 29–35 for the dip versus a flat line.

| P | Central T14 at catalog density |
|---|---|
| 130 d | 5.8 h |
| 648 d | 9.9 h |
| 1000 d | 11.4 h |

## 7. Catalogues

| Source | Result |
|---|---|
| ExoFOP | no TOI, CTOI, imaging, spectra, time series or companions |
| VSX API | nothing within 2′ |
| SIMBAD (Harvard mirror) | target PM* (1 reference); UCAC4 076-006381 (Pe*) at 10.6″; 1RXS J063229.5-745132 (X-ray) at 18″; GLEAM radio source at 27″ |
| VizieR (CDS) | timed out |

## Problems found in the automated vet

1. The neighbour list includes the target itself, because proper motion was not propagated.
2. The single-transit search used QLP only and ignored 21 SPOC 2-min sectors.
3. "No second pipeline" is wrong: eleanor-lite S12 exists.
4. The "secondary eclipse at 3735.01" and the "8.16 h pulsation" are QLP artifacts.
5. There is no CCD-edge check, though EdgeWarn is set in S12 and S89.

## What I could not check

- CDS VizieR and SIMBAD were unreachable, so the TESS EB catalogue on VizieR was not checked (Gaia variability tables were checked directly and are empty).
- No imaging or RVs exist, so the companion is unconstrained.
- No MCMC (emcee not installed); a χ² profile grid was used instead.

## Files

- Scripts: `step1_*` … `step7_catalogs.py`, plus `lcio.py` and `measure.py`.
- `data/` (JSON, `gaia_2arcmin.csv`, downloaded FITS).
- `figs/`: `raw_window_s12.png`, `qlp_flux_vs_bkg.png`, `own_phot_s12.png`, `neighbors_s12.png`, `diffimage_s12.png`, `other_dips_check.png`.
