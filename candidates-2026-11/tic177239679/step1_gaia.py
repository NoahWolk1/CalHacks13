import warnings; warnings.filterwarnings("ignore")
from astroquery.gaia import Gaia
import numpy as np, json
IDS=[5267268245941081472,5267268250236345600]
cols="""source_id,ra,dec,pmra,pmdec,pmra_error,pmdec_error,parallax,parallax_error,phot_g_mean_mag,phot_bp_mean_mag,phot_rp_mean_mag,bp_rp,
ruwe,astrometric_excess_noise,astrometric_excess_noise_sig,ipd_gof_harmonic_amplitude,ipd_frac_multi_peak,ipd_frac_odd_win,non_single_star,phot_variable_flag,
radial_velocity,radial_velocity_error,rv_nb_transits,rv_chisq_pvalue,rv_renormalised_gof,rv_amplitude_robust,phot_bp_rp_excess_factor,duplicated_source,visibility_periods_used,
teff_gspphot,logg_gspphot,distance_gspphot,vbroad,has_xp_continuous,has_epoch_photometry,phot_bp_n_blended_transits,phot_rp_n_blended_transits,phot_bp_n_obs,phot_rp_n_obs"""
out={}
for sid in IDS:
    t=Gaia.launch_job_async(f"SELECT {cols} FROM gaiadr3.gaia_source WHERE source_id={sid}").get_results()
    r={c:(None if np.ma.is_masked(t[c][0]) else (t[c][0].item() if hasattr(t[c][0],"item") else str(t[c][0]))) for c in t.colnames}
    print("====",sid)
    for k,v in r.items(): print(" ",k,v)
    MG=r['phot_g_mean_mag']+5*np.log10(r['parallax']/100); print("  M_G",MG)
    r["M_G"]=MG
    for tab in ["gaiadr3.nss_two_body_orbit","gaiadr3.nss_acceleration_astro","gaiadr3.nss_non_linear_spectro","gaiadr3.vari_summary","gaiadr3.vari_eclipsing_binary","gaiadr3.astrophysical_parameters"]:
        try:
            x=Gaia.launch_job_async(f"SELECT * FROM {tab} WHERE source_id={sid}").get_results()
            print(" ",tab, len(x)); r[tab]=len(x)
            if len(x) and tab=="gaiadr3.astrophysical_parameters":
                for c in ["teff_gspphot","logg_gspphot","radius_gspphot","lum_flame","radius_flame","mass_flame","age_flame","evolstage_flame","teff_gspspec","logg_gspspec","teff_msc1","teff_msc2","logg_msc1","logg_msc2","classprob_dsc_combmod_binarystar","spectraltype_esphs","mh_gspphot","ag_gspphot","distance_gspphot","vsini_esphs"]:
                    v=x[c][0]; v=None if np.ma.is_masked(v) else (v.item() if hasattr(v,"item") else str(v)); print("    ",c,v); r["ap_"+c]=v
            elif len(x): print(x)
        except Exception as e: print(tab,"ERR",e)
    out[str(sid)]=r
a,b=out[str(IDS[0])],out[str(IDS[1])]
sep=np.hypot((a['ra']-b['ra'])*np.cos(np.radians(a['dec'])),a['dec']-b['dec'])*3600
dpm=np.hypot(a['pmra']-b['pmra'],a['pmdec']-b['pmdec'])
print("pair sep arcsec",sep,"PA", np.degrees(np.arctan2((b['ra']-a['ra'])*np.cos(np.radians(a['dec'])),b['dec']-a['dec'])), "dPM mas/yr",dpm,"dplx",a['parallax']-b['parallax'],"proj sep AU",sep*1000/a['parallax'],
      "tangential vel diff km/s", dpm*4.74/a['parallax'])
out["pair"]=dict(sep=sep,dpm=dpm,dplx=a['parallax']-b['parallax'],proj_au=sep*1000/a['parallax'],dvtan=dpm*4.74/a['parallax'])
json.dump(out,open("data/gaia_pair.json","w"),indent=1,default=str)
q2="""SELECT source_id,ra,dec,pmra,pmdec,parallax,phot_g_mean_mag,phot_bp_mean_mag,phot_rp_mean_mag,bp_rp,ruwe,phot_variable_flag,
 DISTANCE(POINT(105.20127450,-71.20768920), POINT(ra,dec))*3600 AS sep
 FROM gaiadr3.gaia_source WHERE 1=CONTAINS(POINT(ra,dec), CIRCLE(105.20127450,-71.20768920, 0.05)) ORDER BY sep"""
t2=Gaia.launch_job_async(q2).get_results(); t2.write("data/gaia_3arcmin.csv",overwrite=True)
print(len(t2)); print(t2[:20].pformat(max_width=-1))
