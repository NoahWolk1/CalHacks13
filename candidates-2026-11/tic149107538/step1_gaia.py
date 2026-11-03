import warnings; warnings.filterwarnings("ignore")
from astroquery.gaia import Gaia
import numpy as np, json
RA,DEC=80.89196830772,-61.41026676419
IDS=[4757908287398076032,4757908287396465408]
cols="""source_id,ra,dec,pmra,pmdec,pmra_error,pmdec_error,parallax,parallax_error,phot_g_mean_mag,phot_bp_mean_mag,phot_rp_mean_mag,bp_rp,
ruwe,astrometric_excess_noise,astrometric_excess_noise_sig,ipd_gof_harmonic_amplitude,ipd_frac_multi_peak,ipd_frac_odd_win,non_single_star,phot_variable_flag,
radial_velocity,radial_velocity_error,rv_nb_transits,rv_chisq_pvalue,rv_renormalised_gof,rv_amplitude_robust,rv_template_teff,rv_method_used,phot_bp_rp_excess_factor,duplicated_source,visibility_periods_used,
teff_gspphot,logg_gspphot,distance_gspphot,vbroad,vbroad_error,vbroad_nb_transits,has_epoch_rv,has_epoch_photometry"""
out={}
for sid in IDS:
    t=Gaia.launch_job_async(f"SELECT {cols} FROM gaiadr3.gaia_source WHERE source_id={sid}").get_results()
    r={c:(None if np.ma.is_masked(t[c][0]) else (t[c][0].item() if hasattr(t[c][0],"item") else str(t[c][0]))) for c in t.colnames}
    print("====",sid)
    for k,v in r.items(): print(" ",k,v)
    if r['parallax'] and r['parallax']>0: r["M_G"]=r['phot_g_mean_mag']+5*np.log10(r['parallax']/100); print("  M_G",r["M_G"])
    for tab in ["gaiadr3.nss_two_body_orbit","gaiadr3.nss_acceleration_astro","gaiadr3.nss_non_linear_spectro","gaiadr3.nss_vim_fl","gaiadr3.vari_summary","gaiadr3.vari_eclipsing_binary","gaiadr3.vari_rotation_modulation","gaiadr3.astrophysical_parameters"]:
        try:
            x=Gaia.launch_job_async(f"SELECT * FROM {tab} WHERE source_id={sid}").get_results()
            print(" ",tab, len(x)); r[tab]=len(x)
            if len(x) and tab=="gaiadr3.astrophysical_parameters":
                for c in ["teff_gspphot","logg_gspphot","radius_gspphot","lum_flame","radius_flame","mass_flame","age_flame","evolstage_flame","teff_gspspec","logg_gspspec","mh_gspspec","teff_msc1","teff_msc2","logg_msc1","logg_msc2","classprob_dsc_combmod_binarystar","spectraltype_esphs","mh_gspphot","ag_gspphot","distance_gspphot","vsini_esphs","activityindex_espcs"]:
                    v=x[c][0]; v=None if np.ma.is_masked(v) else (v.item() if hasattr(v,"item") else str(v)); print("    ",c,v); r["ap_"+c]=v
            elif len(x):
                d={}
                for c in x.colnames:
                    v=x[c][0]
                    try: d[c]=None if np.ma.is_masked(v) else (v.item() if np.size(v)==1 and hasattr(v,"item") else str(v))
                    except Exception: d[c]=str(v)
                r[tab+"_row"]=d
                print({k:v for k,v in d.items() if v is not None})
        except Exception as e: print(tab,"ERR",e)
    out[str(sid)]=r
json.dump(out,open("data/gaia.json","w"),indent=1,default=str)
q2=f"""SELECT source_id,ra,dec,pmra,pmdec,parallax,parallax_error,phot_g_mean_mag,bp_rp,ruwe,non_single_star,phot_variable_flag,radial_velocity,
 DISTANCE(POINT({RA},{DEC}), POINT(ra,dec))*3600 AS sep
 FROM gaiadr3.gaia_source WHERE 1=CONTAINS(POINT(ra,dec), CIRCLE({RA},{DEC}, 0.0334)) ORDER BY sep"""
t2=Gaia.launch_job_async(q2).get_results(); t2.write("data/gaia_2arcmin.csv",overwrite=True)
print(len(t2)); print(t2[:25].pformat(max_width=-1))
nss=[s for s in t2['source_id'] if t2['non_single_star'][list(t2['source_id']).index(s)]>0]
print("neighbours with NSS:",nss)
