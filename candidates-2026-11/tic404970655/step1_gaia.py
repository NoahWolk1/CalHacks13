import warnings; warnings.filterwarnings("ignore")
from astroquery.gaia import Gaia
from common import RA, DEC
q=f"""SELECT source_id, ra, dec, phot_g_mean_mag, phot_bp_mean_mag, phot_rp_mean_mag, bp_rp, parallax, parallax_error, pmra, pmra_error, pmdec, pmdec_error, ruwe, radial_velocity, radial_velocity_error, rv_nb_transits, rv_amplitude_robust, rv_chisq_pvalue, non_single_star, phot_variable_flag, ipd_frac_multi_peak, ipd_gof_harmonic_amplitude, phot_bp_rp_excess_factor, teff_gspphot, logg_gspphot, distance_gspphot, ag_gspphot, has_epoch_photometry,
 DISTANCE(POINT(ra,dec),POINT({RA},{DEC}))*3600 AS sep
FROM gaiadr3.gaia_source WHERE CONTAINS(POINT(ra,dec),CIRCLE({RA},{DEC},0.0334))=1 ORDER BY sep"""
r=Gaia.launch_job_async(q).get_results(); print(len(r))
r.write("data/gaia_2arcmin.csv", overwrite=True)
r[:10]['source_id','sep','phot_g_mean_mag','bp_rp','parallax','parallax_error','pmra','pmdec','ruwe','non_single_star','phot_variable_flag','ipd_frac_multi_peak'].pprint(max_width=300)
b=r[r['phot_g_mean_mag']<r['phot_g_mean_mag'][0]+4]
print("== neighbours within 2' with G < G_target+4:",len(b))
b['source_id','sep','phot_g_mean_mag','bp_rp','parallax','pmra','pmdec','ruwe','non_single_star','phot_variable_flag'].pprint(max_width=300,max_lines=60)
t=r[0]
for c in r.colnames: print("  ",c, t[c])
sid=t['source_id']
ids=",".join(str(x) for x in b['source_id'])
for tb in ["astrophysical_parameters","vari_summary","vari_classifier_result","nss_two_body_orbit","nss_acceleration_astro","nss_non_linear_spectro","vari_eclipsing_binary","vari_long_period_variable","vari_ms_oscillator"]:
    try:
        x=Gaia.launch_job_async(f"SELECT * FROM gaiadr3.{tb} WHERE source_id={sid}").get_results()
        print("==",tb, len(x))
        if len(x):
            for c in x.colnames:
                v=x[c][0]
                if str(v) not in ('--','nan','') : print("  ",c,v)
    except Exception as e: print(tb,"ERR",e)
for tb in ["nss_two_body_orbit","nss_acceleration_astro","vari_classifier_result","vari_eclipsing_binary"]:
    try:
        x=Gaia.launch_job_async(f"SELECT * FROM gaiadr3.{tb} WHERE source_id IN ({ids})").get_results()
        print("== neighbours in",tb, len(x))
        if len(x): print(x[[c for c in x.colnames][:8]])
    except Exception as e: print(tb,"ERR",e)
