import warnings; warnings.filterwarnings("ignore")
from astroquery.gaia import Gaia
from common import RA,DEC
q=f"""SELECT source_id, ra, dec, phot_g_mean_mag, phot_bp_mean_mag, phot_rp_mean_mag, bp_rp, parallax, parallax_error, pmra, pmra_error, pmdec, pmdec_error, ruwe, radial_velocity, radial_velocity_error, rv_nb_transits, rv_amplitude_robust, rv_chisq_pvalue, non_single_star, phot_variable_flag, ipd_frac_multi_peak, ipd_gof_harmonic_amplitude, phot_bp_rp_excess_factor, teff_gspphot, logg_gspphot, distance_gspphot, ag_gspphot,
 DISTANCE(POINT(ra,dec),POINT({RA},{DEC}))*3600 AS sep
FROM gaiadr3.gaia_source WHERE CONTAINS(POINT(ra,dec),CIRCLE({RA},{DEC},0.0334))=1 ORDER BY sep"""
r=Gaia.launch_job_async(q).get_results(); print(len(r))
r[:12].pprint(max_width=400, max_lines=40)
r.write("data/gaia_2arcmin.csv", overwrite=True)
sid=r['source_id'][0]
for t in ["astrophysical_parameters","vari_summary","vari_classifier_result","nss_two_body_orbit","nss_acceleration_astro","vari_long_period_variable","vari_eclipsing_binary"]:
    try:
        x=Gaia.launch_job(f"SELECT * FROM gaiadr3.{t} WHERE source_id={sid}").get_results()
        print("==",t, len(x))
        if len(x):
            for c in x.colnames:
                v=x[c][0]
                if str(v) not in ('--','nan',''): print("  ",c,v)
    except Exception as e: print(t,"ERR",e)
