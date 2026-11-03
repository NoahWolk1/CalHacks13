# Follow-up brief (for each assigned TIC)

Goal: decide whether a TESS planet-sweep find is a real planet candidate or not, with a full follow-up like the earlier ones in this folder.

**Read first:** `tic150098860/REPORT.md`, `tic167304394/REPORT.md`, `tic177239679/REPORT.md` and `tic389364321/REPORT.md` (format and depth). Reuse or adapt their scripts (`lcio.py`, `measure.py`, `common.py`, `step*.py`).

**Inputs:** `vet_<TIC>.json` here is our automated vet's full report: `input` holds the find (times or period/t0 in BTJD, duration and depth as fractions), and `checks` holds every check. Treat its flags as leads, not facts.

**Python:** run `../.venv/bin/python -W ignore <script>` from `tic<TIC>/`. lightkurve, astroquery and batman are installed.

## What to check

1. **The host.** TIC 8.2 and Gaia DR3 (cone search by position if the TIC has no Gaia id): parallax, CMD position, binarity indicators, NSS orbits (of the target *and* of every neighbour bright enough to matter in the aperture), radial velocity, SIMBAD type.
   * Stars toward the LMC (RA ≈ 70–95°, Dec ≈ −63 to −73°) with TIC distances of several kpc: check LMC membership (parallax, proper motion, RV) and the real radius. These are often giants or supergiants with wrong TIC parameters.
2. **The depth in every reduction.** SPOC/TESS-SPOC SAP and PDCSAP, every QLP column, any HLSPs, and your own TESScut (or TPF) photometry at several apertures. Also re-centre the event and re-measure its depth and duration.
3. **Systematics.** Quality flags, momentum dumps, gaps and orbit edges, scattered light, background, pointing jitter, and same-time dips on other stars on the same CCD.
4. **Location.** Difference image or per-pixel fit, plus the eclipse depth each Gaia neighbour would need.
5. **All sectors.** Repeats (of any depth: a much deeper repeat means the original depth was underestimated), secondary eclipses at any phase, odd/even, and the periods still allowed.
   * If the star varies, model the variability (prewhitening or a free-amplitude model, or a binary's orbit) before measuring the dip.
   * Count dips *and* brightenings of the event's size: equal rates mean noise.
6. **Shape.** A transit fit, and the implied stellar density compared with the star's.
7. **Prior knowledge.** ExoFOP, the TOI and CTOI lists, VSX (AAVSO API) and SIMBAD. VizieR is often down; the CfA mirrors sometimes work.

**Verdicts:** planet candidate (worth reporting); unconfirmed (say exactly what data would decide); eclipsing binary/blend; stellar variability; or noise/systematic artifact.

Be skeptical: all eight "clean" dips followed up so far were not planets. Don't claim a cause you didn't check in the data.

## Rules

* Public data only, read-only. Submit nothing anywhere.
* Don't edit anything under `web/`, don't commit, and don't touch any remote server.
* Keep downloads to what you need.

## Output

* Write `tic<TIC>/REPORT.md` in the format of the earlier reports: verdict, step status table, sections 1–7, what would change the verdict, not checked, pipeline note, files.
* **If writing REPORT.md is refused, put the complete REPORT.md text verbatim in your final reply.** Earlier agents were refused and their reports were lost when they only summarised. Otherwise, the final reply is a ≤150-word summary per TIC: verdict and the decisive numbers.
