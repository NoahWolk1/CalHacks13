import warnings; warnings.filterwarnings("ignore")
from astroquery.gaia import Gaia
from common import RA, DEC
q=f"""SELECT source_id, ra, dec, phot_g_mean_mag, phot_bp_mean_mag, phot_rp_mean_mag, bp_rp, parallax, parallax_error, pmra, pmra_error, pmdec, pmdec_error, ruwe, radial_velocity, radial_velocity_error, rv_nb_transits, rv_amplitude_robust, rv_chisq_pvalue, non_single_star, phot_variable_flag, ipd_frac_multi_peak, ipd_gof_harmonic_amplitude, phot_bp_rp_excess_factor, teff_gspphot, logg_gspphot, distance_gspphot, ag_gspphot, astrometric_excess_noise_sig, duplicated_source,
 DISTANCE(POINT(ra,dec),POINT({RA},{DEC}))*3600 AS sep
FROM gaiadr3.gaia_source WHERE CONTAINS(POINT(ra,dec),CIRCLE({RA},{DEC},0.05))=1 ORDER BY sep"""
r=Gaia.launch_job_async(q).get_results(); print(len(r))
r[:15].pprint(max_width=400, max_lines=40)
r.write("data/gaia_3arcmin.csv", overwrite=True)
sid=r['source_id'][0]
for t in ["astrophysical_parameters","vari_summary","vari_classifier_result","nss_two_body_orbit","nss_acceleration_astro","nss_non_linear_spectro","vari_eclipsing_binary","vari_long_period_variable"]:
    try:
        x=Gaia.launch_job(f"SELECT * FROM gaiadr3.{t} WHERE source_id={sid}").get_results()
        print("==",t, len(x))
        if len(x):
            for c in x.colnames:
                v=x[c][0]
                if str(v) not in ('--','nan','') : print("  ",c,v)
    except Exception as e: print(t,"ERR",e)
ids=",".join(str(s) for s,g,sp in zip(r['source_id'],r['phot_g_mean_mag'],r['sep']) if sp<120 and g<17.5)
for t in ["nss_two_body_orbit","nss_acceleration_astro","vari_classifier_result","vari_eclipsing_binary"]:
    try:
        x=Gaia.launch_job(f"SELECT * FROM gaiadr3.{t} WHERE source_id IN ({ids})").get_results()
        print("== neighbours (G<17.5, <2'):",t,len(x))
        for row in x: print("   ", {c:row[c] for c in x.colnames[:14]})
    except Exception as e: print(t,"ERR",e)
