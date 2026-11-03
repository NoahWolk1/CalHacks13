import warnings; warnings.filterwarnings("ignore")
from astroquery.gaia import Gaia
import numpy as np, json
from cfg import *
def row(t,i=0):
    return {c:(None if np.ma.is_masked(t[c][i]) else (t[c][i].item() if hasattr(t[c][i],"item") else str(t[c][i]))) for c in t.colnames}
q2=f"""SELECT source_id,ra,dec,pmra,pmdec,parallax,parallax_error,phot_g_mean_mag,phot_bp_mean_mag,phot_rp_mean_mag,bp_rp,ruwe,
 ipd_frac_multi_peak,ipd_gof_harmonic_amplitude,non_single_star,radial_velocity,radial_velocity_error,phot_variable_flag,
 DISTANCE(POINT({RA},{DEC}), POINT(ra,dec))*3600 AS sep
 FROM gaiadr3.gaia_source WHERE 1=CONTAINS(POINT(ra,dec), CIRCLE({RA},{DEC}, 0.0333333)) ORDER BY sep"""
t2=Gaia.launch_job(q2).get_results(); t2.write("data/gaia_2arcmin.csv",overwrite=True,format="csv")
print(len(t2)); print(t2[:15].pformat(max_width=-1))
sid=int(t2["source_id"][0])
q=f"""SELECT g.*, a.teff_gspphot as ap_teff, a.logg_gspphot as ap_logg, a.radius_gspphot, a.radius_flame, a.mass_flame, a.lum_flame, a.age_flame,
a.mh_gspphot, a.ag_gspphot, a.classprob_dsc_combmod_binarystar, a.spectraltype_esphs, a.teff_esphs, a.distance_gspphot as ap_dist
FROM gaiadr3.gaia_source g LEFT JOIN gaiadr3.astrophysical_parameters a ON a.source_id=g.source_id WHERE g.source_id={sid}"""
t=Gaia.launch_job(q).get_results(); r=row(t)
keys=["source_id","ra","dec","parallax","parallax_error","pmra","pmdec","phot_g_mean_mag","bp_rp","ruwe","astrometric_excess_noise","astrometric_excess_noise_sig","ipd_gof_harmonic_amplitude","ipd_frac_multi_peak","ipd_frac_odd_win","non_single_star","phot_variable_flag","radial_velocity","radial_velocity_error","rv_nb_transits","rv_chisq_pvalue","rv_renormalised_gof","rv_amplitude_robust","duplicated_source","visibility_periods_used","phot_bp_rp_excess_factor","teff_gspphot","logg_gspphot","distance_gspphot","ap_teff","ap_logg","radius_gspphot","radius_flame","mass_flame","lum_flame","age_flame","mh_gspphot","ag_gspphot","classprob_dsc_combmod_binarystar","spectraltype_esphs","teff_esphs","has_epoch_photometry","has_rvs"]
for k in keys: print(k, r.get(k))
plx=r['parallax']; print("1/plx pc",1000/plx,"M_G",r['phot_g_mean_mag']+5*np.log10(plx/100))
json.dump(r,open("data/gaia_target.json","w"),indent=1,default=str)
# NSS / vari for all sources within 1'
ids=",".join(str(int(s)) for s,sep in zip(t2["source_id"],t2["sep"]) if sep<60)
res={}
for tab in ["gaiadr3.nss_two_body_orbit","gaiadr3.nss_acceleration_astro","gaiadr3.nss_non_linear_spectro","gaiadr3.nss_vim_fl","gaiadr3.vari_summary","gaiadr3.vari_eclipsing_binary","gaiadr3.vari_classifier_result"]:
    try:
        x=Gaia.launch_job(f"SELECT * FROM {tab} WHERE source_id IN ({ids})").get_results()
        print(tab, len(x)); res[tab]=[row(x,i) for i in range(len(x))]
        for i in range(len(x)): print("  ", {k:v for k,v in row(x,i).items() if k in ("source_id","period","nss_solution_type","best_class_name","best_class_score","num_selected_g_fov","mean_mag_g_fov","std_dev_mag_g_fov","significance","eccentricity","semi_amplitude_primary","frequency")})
    except Exception as e: print(tab,"ERR",e)
json.dump(res,open("data/gaia_nss_vari.json","w"),indent=1,default=str)
