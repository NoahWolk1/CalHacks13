import warnings; warnings.filterwarnings("ignore")
from astroquery.gaia import Gaia
RA,DEC=105.11565383635,-65.90870110625
q=f"""SELECT source_id, ra, dec, phot_g_mean_mag, phot_bp_mean_mag, phot_rp_mean_mag, bp_rp, parallax, parallax_error, pmra, pmdec, ruwe, astrometric_excess_noise, astrometric_excess_noise_sig, radial_velocity, radial_velocity_error, rv_nb_transits, rv_chisq_pvalue, rv_amplitude_robust, rv_renormalised_gof, non_single_star, phot_variable_flag, ipd_frac_multi_peak, ipd_frac_odd_win, ipd_gof_harmonic_amplitude, visibility_periods_used, teff_gspphot, logg_gspphot, phot_bp_rp_excess_factor, duplicated_source,
 DISTANCE(POINT(ra,dec),POINT({RA},{DEC}))*3600 AS sep
FROM gaiadr3.gaia_source WHERE CONTAINS(POINT(ra,dec),CIRCLE({RA},{DEC},0.0334))=1 ORDER BY sep"""
r=Gaia.launch_job_async(q).get_results(); r[:12].pprint(max_width=400, max_lines=40)
r.write("data/gaia_2arcmin.csv", overwrite=True, format="csv")
ids=",".join(str(x) for x in r['source_id'][:3])
for t in ["nss_two_body_orbit","nss_acceleration_astro","nss_non_linear_spectro","vari_summary","vari_eclipsing_binary","astrophysical_parameters"]:
    try:
        x=Gaia.launch_job_async(f"SELECT * FROM gaiadr3.{t} WHERE source_id IN ({ids})").get_results()
        print(t, len(x))
        if len(x):
            if t=="astrophysical_parameters":
                for c in ["source_id","teff_gspphot","logg_gspphot","radius_flame","mass_flame","lum_flame","age_flame","teff_gspspec","mh_gspphot","radius_gspphot","vsini_esphs","classprob_dsc_combmod_binarystar","evolstage_flame"]:
                    if c in x.colnames: print("  ",c, list(x[c]))
            else: x.pprint(max_width=300)
    except Exception as e: print(t, "ERR", e)
