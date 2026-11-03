"""Gaia DR3: target (by TIC Gaia id) + 2' cone with astrophysical parameters; NSS / variability tables for the target and
every neighbour bright enough to matter (G < G_target + 6 within 1'); M_G, CMD position."""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, json
from astroquery.gaia import Gaia
from common import RA, DEC
q=f"""SELECT g.source_id, g.ra, g.dec, g.pmra, g.pmdec, g.parallax, g.parallax_error, g.phot_g_mean_mag, g.bp_rp, g.ruwe,
 g.non_single_star, g.ipd_frac_multi_peak, g.ipd_gof_harmonic_amplitude, g.astrometric_excess_noise, g.astrometric_excess_noise_sig, g.duplicated_source,
 g.radial_velocity, g.radial_velocity_error, g.rv_nb_transits, g.rv_chisq_pvalue, g.rv_amplitude_robust, g.phot_variable_flag, g.vbroad,
 g.teff_gspphot, g.logg_gspphot, g.distance_gspphot, g.ag_gspphot, a.radius_flame, a.mass_flame, a.lum_flame, a.age_flame, a.evolstage_flame, a.radius_gspphot,
 a.teff_gspspec, a.logg_gspspec, a.classprob_dsc_combmod_binarystar, a.spectraltype_esphs,
 DISTANCE(POINT({RA},{DEC}), POINT(g.ra,g.dec))*3600 AS sep
 FROM gaiadr3.gaia_source AS g LEFT JOIN gaiadr3.astrophysical_parameters AS a ON g.source_id=a.source_id
 WHERE 1=CONTAINS(POINT(g.ra,g.dec), CIRCLE({RA},{DEC}, 0.0333333)) ORDER BY sep"""
g=Gaia.launch_job_async(q).get_results(); g.write("data/gaia_2arcmin.csv",overwrite=True,format="csv")
val=lambda v: None if np.ma.is_masked(v) else (v.item() if hasattr(v,"item") else str(v))
tgt={k:val(g[0][k]) for k in g.colnames}
print("N sources within 2'",len(g)); print("TARGET"); [print("  ",k,v) for k,v in tgt.items()]
tgt["M_G"]=tgt["phot_g_mean_mag"]+5*np.log10(tgt["parallax"]/100); tgt["d_pc_1/plx"]=1000/tgt["parallax"]
print("  M_G",tgt["M_G"],"d",tgt["d_pc_1/plx"])
G0=tgt["phot_g_mean_mag"]
nb=[r for r in g if r["sep"]<60 and r["phot_g_mean_mag"]<G0+6]
ids=",".join(str(r["source_id"]) for r in nb)
print("neighbours within 60\" with G<G0+6:",len(nb)-1)
for r in nb[1:]: print("  ",r["source_id"],round(float(r["sep"]),1),"G",round(float(r["phot_g_mean_mag"]),2),"plx",val(r["parallax"]),"ruwe",val(r["ruwe"]),"nss",val(r["non_single_star"]),"var",val(r["phot_variable_flag"]))
out={"target":tgt,"neighbours_checked":[int(r["source_id"]) for r in nb]}
for tab in ["nss_two_body_orbit","nss_acceleration_astro","nss_non_linear_spectro","nss_vim_fl","vari_summary","vari_eclipsing_binary","vari_classifier_result","vari_rotation_modulation","vari_short_timescale"]:
    try:
        t=Gaia.launch_job_async(f"SELECT * FROM gaiadr3.{tab} WHERE source_id IN ({ids})").get_results()
        out[tab]=[{k:str(r[k]) for k in t.colnames} for r in t]; print(tab,len(t))
        for r in out[tab]: print("    ",{k:v for k,v in r.items() if v not in ("--","nan")} if len(r)<60 else {k:r[k] for k in list(r)[:25]})
    except Exception as e: out[tab]=f"ERR {e}"; print(tab,"ERR",str(e)[:200])
json.dump(out,open("data/step1_gaia.json","w"),indent=1,default=str)
