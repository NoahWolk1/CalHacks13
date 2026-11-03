import warnings; warnings.filterwarnings("ignore")
from astroquery.gaia import Gaia
import numpy as np, json
from common import *
SID=4762785549177553920
cols="""source_id,ra,dec,pmra,pmdec,parallax,parallax_error,phot_g_mean_mag,phot_bp_mean_mag,phot_rp_mean_mag,bp_rp,
ruwe,astrometric_excess_noise,astrometric_excess_noise_sig,ipd_gof_harmonic_amplitude,ipd_frac_multi_peak,ipd_frac_odd_win,non_single_star,phot_variable_flag,
radial_velocity,radial_velocity_error,rv_nb_transits,rv_chisq_pvalue,rv_renormalised_gof,rv_amplitude_robust,rv_template_teff,rv_method_used,rv_expected_sig_to_noise,grvs_mag,phot_bp_rp_excess_factor,duplicated_source,visibility_periods_used,
teff_gspphot,logg_gspphot,distance_gspphot,vbroad,phot_bp_n_blended_transits,phot_rp_n_blended_transits"""
t=Gaia.launch_job_async(f"SELECT {cols} FROM gaiadr3.gaia_source WHERE source_id={SID}").get_results()
r={c:(None if np.ma.is_masked(t[c][0]) else (t[c][0].item() if hasattr(t[c][0],"item") else str(t[c][0]))) for c in t.colnames}
for k,v in r.items(): print(" ",k,v)
r["M_G"]=r['phot_g_mean_mag']+5*np.log10(r['parallax']/100); print("M_G",r["M_G"])
for tab in ["nss_two_body_orbit","nss_acceleration_astro","nss_non_linear_spectro","vari_summary","vari_eclipsing_binary","vari_classifier_result"]:
    x=Gaia.launch_job_async(f"SELECT * FROM gaiadr3.{tab} WHERE source_id={SID}").get_results(); print(tab,len(x)); r[tab]=len(x)
x=Gaia.launch_job_async(f"SELECT * FROM gaiadr3.astrophysical_parameters WHERE source_id={SID}").get_results()
for c in ["teff_gspphot","logg_gspphot","radius_gspphot","lum_flame","radius_flame","mass_flame","age_flame","evolstage_flame","teff_gspspec","logg_gspspec","classprob_dsc_combmod_binarystar","spectraltype_esphs","mh_gspphot","ag_gspphot","vsini_esphs","activityindex_espcs"]:
    v=x[c][0]; v=None if np.ma.is_masked(v) else (v.item() if hasattr(v,"item") else str(v)); print("  ap",c,v); r["ap_"+c]=v
# RV comparison: stars of similar grvs_mag / rv_nb_transits, how big is rv_amplitude_robust typically?
q=f"""SELECT rv_amplitude_robust, radial_velocity_error, rv_chisq_pvalue, rv_nb_transits FROM gaiadr3.gaia_source
WHERE grvs_mag BETWEEN {r['grvs_mag']-0.15} AND {r['grvs_mag']+0.15} AND rv_template_teff BETWEEN 4500 AND 5200 AND rv_nb_transits BETWEEN 12 AND 22 AND rv_method_used=2 AND random_index<3000000"""
c=Gaia.launch_job_async(q).get_results()
a=np.array(c["rv_amplitude_robust"],float); e=np.array(c["radial_velocity_error"],float); p=np.array(c["rv_chisq_pvalue"],float)
r["rv_comparison"]=dict(n=len(a),amp_median=float(np.nanmedian(a)),amp_p84=float(np.nanpercentile(a,84)),amp_p95=float(np.nanpercentile(a,95)),frac_amp_ge_target=float(np.nanmean(a>=r["rv_amplitude_robust"])),
   err_median=float(np.nanmedian(e)),pval_median=float(np.nanmedian(p)))
print("RV comparison sample:",r["rv_comparison"])
json.dump(r,open("data/step1_gaia.json","w"),indent=1,default=str)
q2=f"""SELECT source_id,ra,dec,pmra,pmdec,parallax,phot_g_mean_mag,phot_bp_mean_mag,phot_rp_mean_mag,bp_rp,ruwe,non_single_star,phot_variable_flag,radial_velocity,rv_amplitude_robust,rv_chisq_pvalue,
 DISTANCE(POINT({RA},{DEC}), POINT(ra,dec))*3600 AS sep FROM gaiadr3.gaia_source WHERE 1=CONTAINS(POINT(ra,dec), CIRCLE({RA},{DEC}, 0.0333)) ORDER BY sep"""
t2=Gaia.launch_job_async(q2).get_results(); t2.write("data/gaia_2arcmin.csv",overwrite=True)
print(len(t2)); print(t2[:20].pformat(max_width=-1))
ids=",".join(str(s) for s in t2["source_id"][(t2["phot_g_mean_mag"]<18)])
for tab in ["nss_two_body_orbit","nss_acceleration_astro","vari_summary","vari_eclipsing_binary","vari_classifier_result"]:
    x=Gaia.launch_job_async(f"SELECT source_id FROM gaiadr3.{tab} WHERE source_id IN ({ids})").get_results(); print("neighbours in",tab,list(x["source_id"]))
