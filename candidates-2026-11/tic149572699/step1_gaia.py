import warnings; warnings.filterwarnings("ignore")
from astroquery.gaia import Gaia
import numpy as np, json
from common import RA, DEC, TIC
tic=json.load(open("data/tic.json")) if __import__("os").path.exists("data/tic.json") else {}
COLS="""g.source_id,g.ra,g.dec,g.pmra,g.pmdec,g.parallax,g.parallax_error,g.phot_g_mean_mag,g.phot_bp_mean_mag,g.phot_rp_mean_mag,g.bp_rp,
g.ruwe,g.astrometric_excess_noise,g.astrometric_excess_noise_sig,g.ipd_gof_harmonic_amplitude,g.ipd_frac_multi_peak,g.ipd_frac_odd_win,g.non_single_star,g.phot_variable_flag,
g.radial_velocity,g.radial_velocity_error,g.rv_nb_transits,g.rv_chisq_pvalue,g.rv_renormalised_gof,g.rv_amplitude_robust,g.phot_bp_rp_excess_factor,g.duplicated_source,
g.teff_gspphot,g.logg_gspphot,g.distance_gspphot,g.has_epoch_photometry"""
q=f"""SELECT {COLS}, DISTANCE(POINT({RA},{DEC}), POINT(g.ra,g.dec))*3600 AS sep
 FROM gaiadr3.gaia_source g WHERE 1=CONTAINS(POINT(g.ra,g.dec), CIRCLE({RA},{DEC}, 0.0333333)) ORDER BY sep"""
t=Gaia.launch_job(q).get_results(); t.write("data/gaia_2arcmin.csv",overwrite=True,format="csv")
print(len(t),"sources within 2'")
print(t["source_id","sep","phot_g_mean_mag","bp_rp","parallax","ruwe","ipd_frac_multi_peak","non_single_star","phot_variable_flag","radial_velocity"][:30].pformat(max_width=-1,max_lines=-1))
tg=t[0]
r={c:(None if np.ma.is_masked(tg[c]) else (tg[c].item() if hasattr(tg[c],"item") else str(tg[c]))) for c in t.colnames}
print("\nTARGET"); [print(" ",k,v) for k,v in r.items()]
plx=r['parallax']; MG=r['phot_g_mean_mag']+5*np.log10(plx/100)
print("dist pc",1000/plx,"M_G",MG)
json.dump(r,open("data/gaia_target.json","w"),indent=1,default=str)
# NSS / vari / AP for every source within 2' brighter than G 19
ids=[int(x) for x,g in zip(t["source_id"],t["phot_g_mean_mag"]) if np.isfinite(g) and g<19.5]
idl=",".join(map(str,ids))
for tab in ["gaiadr3.nss_two_body_orbit","gaiadr3.nss_acceleration_astro","gaiadr3.nss_non_linear_spectro","gaiadr3.nss_vim_fl","gaiadr3.vari_summary","gaiadr3.vari_eclipsing_binary","gaiadr3.vari_classifier_result"]:
    try:
        x=Gaia.launch_job(f"SELECT * FROM {tab} WHERE source_id IN ({idl})").get_results()
        print(tab, len(x))
        if len(x): print(x[:10].pformat(max_width=250))
    except Exception as e: print(tab,"ERR",str(e)[:200])
x=Gaia.launch_job(f"SELECT source_id,teff_gspphot,logg_gspphot,radius_gspphot,lum_flame,radius_flame,mass_flame,age_flame,evolstage_flame,classprob_dsc_combmod_binarystar,spectraltype_esphs,mh_gspphot,ag_gspphot,distance_gspphot,teff_esphs,logg_esphs FROM gaiadr3.astrophysical_parameters WHERE source_id={ids[0]}").get_results()
print(x.pformat(max_width=-1))
