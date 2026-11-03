import warnings; warnings.filterwarnings("ignore")
from astroquery.gaia import Gaia
import numpy as np, json
q="""SELECT g.source_id,g.ra,g.dec,g.pmra,g.pmdec,g.parallax,g.parallax_error,g.parallax_over_error,g.phot_g_mean_mag,g.phot_bp_mean_mag,g.phot_rp_mean_mag,g.bp_rp,
g.ruwe,g.astrometric_excess_noise,g.astrometric_excess_noise_sig,g.ipd_gof_harmonic_amplitude,g.ipd_frac_multi_peak,g.ipd_frac_odd_win,g.non_single_star,g.phot_variable_flag,
g.radial_velocity,g.radial_velocity_error,g.rv_nb_transits,g.rv_chisq_pvalue,g.rv_renormalised_gof,g.phot_bp_rp_excess_factor,g.duplicated_source,g.visibility_periods_used,
g.teff_gspphot,g.logg_gspphot,g.distance_gspphot,g.classprob_dsc_combmod_star, g.has_xp_continuous, g.has_epoch_photometry
FROM gaiadr3.gaia_source g WHERE g.source_id=5261603944288760576"""
t=Gaia.launch_job(q).get_results()
r={c:(None if np.ma.is_masked(t[c][0]) else (t[c][0].item() if hasattr(t[c][0],"item") else str(t[c][0]))) for c in t.colnames}
for k,v in r.items(): print(k,v)
plx=r['parallax']; d=1000/plx
MG=r['phot_g_mean_mag']+5*np.log10(plx/100); 
print("dist pc",d,"M_G",MG,"M_Ks", 11.014+5*np.log10(plx/100))
json.dump(r,open("data/gaia_target.json","w"),indent=1,default=str)
for tab in ["gaiadr3.nss_two_body_orbit","gaiadr3.nss_acceleration_astro","gaiadr3.nss_non_linear_spectro","gaiadr3.nss_vim_fl","gaiadr3.vari_summary","gaiadr3.vari_eclipsing_binary","gaiadr3.astrophysical_parameters"]:
    try:
        x=Gaia.launch_job(f"SELECT * FROM {tab} WHERE source_id=5261603944288760576").get_results()
        print(tab, len(x)); 
        if len(x) and tab=="gaiadr3.astrophysical_parameters":
            for c in ["teff_gspphot","radius_gspphot","lum_flame","radius_flame","mass_flame","teff_msc1","classprob_dsc_combmod_binarystar","spectraltype_esphs","mh_gspphot","ag_gspphot","distance_gspphot"]:
                print("  ",c,x[c][0])
        elif len(x): print(x)
    except Exception as e: print(tab,"ERR",e)
q2="""SELECT source_id,ra,dec,pmra,pmdec,parallax,phot_g_mean_mag,phot_rp_mean_mag,bp_rp,ruwe,
 DISTANCE(POINT(98.1218351995239,-74.8543913275968), POINT(ra,dec))*3600 AS sep
 FROM gaiadr3.gaia_source WHERE 1=CONTAINS(POINT(ra,dec), CIRCLE(98.1218351995239,-74.8543913275968, 0.0333333)) ORDER BY sep"""
t2=Gaia.launch_job(q2).get_results(); t2.write("data/gaia_2arcmin.csv",overwrite=True)
print(len(t2)); print(t2[:25].pformat(max_width=-1))
