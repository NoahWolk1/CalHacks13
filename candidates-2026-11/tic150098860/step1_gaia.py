import warnings; warnings.filterwarnings("ignore")
from astroquery.gaia import Gaia
q="""SELECT source_id, ra, dec, phot_g_mean_mag, bp_rp, parallax, ruwe, radial_velocity, radial_velocity_error, rv_amplitude_robust, non_single_star, phot_variable_flag, ipd_frac_multi_peak, ipd_gof_harmonic_amplitude,
 DISTANCE(POINT(ra,dec),POINT(91.79986171851,-61.99691551567))*3600 AS sep
FROM gaiadr3.gaia_source WHERE CONTAINS(POINT(ra,dec),CIRCLE(91.79986171851,-61.99691551567,0.034))=1 ORDER BY sep"""
r=Gaia.launch_job(q).get_results(); r.pprint(max_width=300, max_lines=50)
r.write("data/gaia_2arcmin.csv", overwrite=True)
for t in ["nss_two_body_orbit","nss_acceleration_astro","nss_non_linear_spectro","vari_summary"]:
    try:
        x=Gaia.launch_job(f"SELECT * FROM gaiadr3.{t} WHERE source_id IN (5481210874877547904,5481210879173429632,5481204999362790912)").get_results()
        print(t, len(x)); 
        if len(x): x.pprint(max_width=300)
    except Exception as e: print(t, "ERR", e)
