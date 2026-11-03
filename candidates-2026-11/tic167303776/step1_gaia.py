"""Gaia DR3: target (TIC Gaia id) + NSS/vari/AP tables, and the 2' cone."""
import warnings; warnings.filterwarnings("ignore")
from astroquery.gaia import Gaia
import numpy as np, json
SID=5280226578890455168; RA,DEC=98.0332440439988,-68.1783294856264
cols="""source_id,ra,dec,pmra,pmdec,parallax,parallax_error,phot_g_mean_mag,phot_bp_mean_mag,phot_rp_mean_mag,bp_rp,ruwe,astrometric_excess_noise,astrometric_excess_noise_sig,
ipd_gof_harmonic_amplitude,ipd_frac_multi_peak,non_single_star,phot_variable_flag,radial_velocity,radial_velocity_error,rv_nb_transits,rv_chisq_pvalue,rv_amplitude_robust,
phot_bp_rp_excess_factor,duplicated_source,teff_gspphot,logg_gspphot,phot_g_n_obs,phot_g_mean_flux_over_error,has_epoch_photometry"""
t=Gaia.launch_job_async(f"SELECT {cols} FROM gaiadr3.gaia_source WHERE source_id={SID}").get_results()
r={c:(None if np.ma.is_masked(t[c][0]) else (t[c][0].item() if hasattr(t[c][0],"item") else str(t[c][0]))) for c in t.colnames}
r["M_G"]=r["phot_g_mean_mag"]+5*np.log10(r["parallax"]/100)
for k,v in r.items(): print(k,v)
for tab in ["nss_two_body_orbit","nss_acceleration_astro","nss_non_linear_spectro","vari_summary","vari_classifier_result","vari_eclipsing_binary","vari_rotation_modulation","vari_short_timescale","astrophysical_parameters"]:
    try:
        x=Gaia.launch_job_async(f"SELECT * FROM gaiadr3.{tab} WHERE source_id={SID}").get_results(); r[tab]=len(x); print(tab,len(x))
        if len(x):
            for c in x.colnames:
                v=x[c][0]
                if not np.ma.is_masked(v) and c not in("solution_id",): print("   ",c,v)
            r[tab+"_row"]={c:str(x[c][0]) for c in x.colnames}
    except Exception as e: print(tab,"ERR",str(e)[:100])
q=f"""SELECT source_id,ra,dec,pmra,pmdec,parallax,parallax_error,phot_g_mean_mag,bp_rp,ruwe,ipd_frac_multi_peak,non_single_star,phot_variable_flag,
 DISTANCE(POINT({RA},{DEC}),POINT(ra,dec))*3600 AS sep FROM gaiadr3.gaia_source WHERE 1=CONTAINS(POINT(ra,dec),CIRCLE({RA},{DEC},0.0334)) ORDER BY sep"""
g=Gaia.launch_job_async(q).get_results(); g.write("data/gaia_2arcmin.csv",overwrite=True)
print(len(g)); print(g[:15].pformat(max_width=-1))
ids=",".join(str(s) for s in g["source_id"][(g["phot_g_mean_mag"]<18.5)])
for tab in ["nss_two_body_orbit","vari_summary","vari_eclipsing_binary"]:
    x=Gaia.launch_job_async(f"SELECT source_id FROM gaiadr3.{tab} WHERE source_id IN ({ids})").get_results(); print("neighbours G<18.5 in",tab,list(x["source_id"])); r["nbr_"+tab]=[int(s) for s in x["source_id"]]
json.dump(r,open("data/step1_gaia.json","w"),indent=1,default=str)
