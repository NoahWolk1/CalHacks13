import warnings; warnings.filterwarnings("ignore")
from astroquery.gaia import Gaia
import json
RA,DEC=106.180320908444,-68.5710119785883
q=f"""SELECT source_id, ra, dec, pmra, pmdec, parallax, parallax_error, phot_g_mean_mag, phot_bp_mean_mag, phot_rp_mean_mag, ruwe,
 ipd_frac_multi_peak, ipd_gof_harmonic_amplitude, non_single_star, radial_velocity, radial_velocity_error, rv_nb_transits, rv_amplitude_robust, rv_chisq_pvalue,
 teff_gspphot, logg_gspphot, distance_gspphot, phot_variable_flag, duplicated_source,
 DISTANCE(POINT({RA},{DEC}), POINT(ra,dec))*3600 AS sep
 FROM gaiadr3.gaia_source WHERE 1=CONTAINS(POINT(ra,dec), CIRCLE({RA},{DEC}, 0.05)) ORDER BY sep"""
t=Gaia.launch_job(q).get_results(); t.write("data/gaia_3arcmin.csv",overwrite=True)
g0=t["phot_g_mean_mag"][0]
t["dG"]=t["phot_g_mean_mag"]-g0
t["flux_ratio"]=10**(-0.4*t["dG"])
t["ecl_depth_needed_for_14ppt"]=0.0141*(1+t["flux_ratio"])/t["flux_ratio"]
print(t[0:1].pformat_all())
b=t[(t["dG"]<5.5)|(t["sep"]<40)]
print(b["source_id","sep","phot_g_mean_mag","dG","ecl_depth_needed_for_14ppt","ruwe","parallax","non_single_star"].pformat(max_lines=-1))
print("N within 3'",len(t))
sid=t["source_id"][0]
for tab in ["gaiadr3.nss_two_body_orbit","gaiadr3.nss_acceleration_astro","gaiadr3.nss_non_linear_spectro","gaiadr3.nss_vim_fl","gaiadr3.vari_summary","gaiadr3.vari_eclipsing_binary","gaiadr3.astrophysical_parameters"]:
    try:
        r=Gaia.launch_job(f"SELECT * FROM {tab} WHERE source_id={sid}").get_results(); print(tab, len(r))
        if tab.endswith("astrophysical_parameters") and len(r):
            for k in ["teff_gspphot","logg_gspphot","radius_gspphot","distance_gspphot","mh_gspphot","radius_flame","mass_flame","lum_flame","age_flame","teff_gspspec","evolstage_flame"]:
                print("  ",k,r[k][0])
    except Exception as e: print(tab,"ERR",e)
