import warnings; warnings.filterwarnings("ignore")
from astroquery.gaia import Gaia
import numpy as np, json
SID=4758589400489342080; RA,DEC=86.0129538124942,-60.847894869467
cols="""source_id,ra,dec,pmra,pmdec,pmra_error,pmdec_error,parallax,parallax_error,phot_g_mean_mag,phot_bp_mean_mag,phot_rp_mean_mag,bp_rp,
ruwe,astrometric_excess_noise,astrometric_excess_noise_sig,ipd_gof_harmonic_amplitude,ipd_frac_multi_peak,ipd_frac_odd_win,non_single_star,phot_variable_flag,
radial_velocity,radial_velocity_error,rv_nb_transits,rv_chisq_pvalue,rv_renormalised_gof,rv_amplitude_robust,rv_template_teff,rv_method_used,phot_bp_rp_excess_factor,duplicated_source,visibility_periods_used,
teff_gspphot,logg_gspphot,mh_gspphot,distance_gspphot,ag_gspphot,vbroad,has_xp_continuous,has_epoch_photometry,has_epoch_rv,phot_g_n_obs,astrometric_params_solved"""
t=Gaia.launch_job_async(f"SELECT {cols} FROM gaiadr3.gaia_source WHERE source_id={SID}").get_results()
r={c:(None if np.ma.is_masked(t[c][0]) else (t[c][0].item() if hasattr(t[c][0],"item") else str(t[c][0]))) for c in t.colnames}
for k,v in r.items(): print(" ",k,v)
if r['parallax'] and r['parallax']>0:
    r["M_G"]=r['phot_g_mean_mag']+5*np.log10(r['parallax']/100); print("  M_G",r["M_G"], "d_pc",1000/r['parallax'])
for tab in ["gaiadr3.nss_two_body_orbit","gaiadr3.nss_acceleration_astro","gaiadr3.nss_non_linear_spectro","gaiadr3.nss_vim_fl","gaiadr3.vari_summary","gaiadr3.vari_eclipsing_binary","gaiadr3.vari_cepheid","gaiadr3.vari_classifier_result","gaiadr3.vari_rotation_modulation","gaiadr3.vari_long_period_variable","gaiadr3.astrophysical_parameters"]:
    try:
        x=Gaia.launch_job_async(f"SELECT * FROM {tab} WHERE source_id={SID}").get_results()
        print("==",tab, len(x)); r[tab]=len(x)
        if len(x):
            d={}
            for c in x.colnames:
                v=x[c][0]
                try: v=None if np.ma.is_masked(v) else (v.item() if np.size(v)==1 and hasattr(v,"item") else str(v))
                except Exception: v=str(v)
                if v is not None and str(v)!="nan": d[c]=v
            r[tab+"_row"]=d
            for k,v in d.items(): print("    ",k,str(v)[:120])
    except Exception as e: print(tab,"ERR",e)
json.dump(r,open("data/gaia_target.json","w"),indent=1,default=str)
q2=f"""SELECT source_id,ra,dec,pmra,pmdec,parallax,parallax_error,phot_g_mean_mag,phot_bp_mean_mag,phot_rp_mean_mag,bp_rp,ruwe,non_single_star,phot_variable_flag,radial_velocity,rv_amplitude_robust,
 DISTANCE(POINT({RA},{DEC}), POINT(ra,dec))*3600 AS sep
 FROM gaiadr3.gaia_source WHERE 1=CONTAINS(POINT(ra,dec), CIRCLE({RA},{DEC}, 0.0334)) ORDER BY sep"""
t2=Gaia.launch_job_async(q2).get_results(); t2.write("data/gaia_2arcmin.csv",overwrite=True,format="csv")
print(len(t2)); print(t2[t2['phot_g_mean_mag']<18.5].pformat(max_width=-1,max_lines=-1))
