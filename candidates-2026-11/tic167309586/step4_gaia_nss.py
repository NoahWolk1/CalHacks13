import warnings; warnings.filterwarnings("ignore")
from astroquery.gaia import Gaia
import json, numpy as np
SID=5266418602628805888
res={}
def conv(v):
    if np.ma.is_masked(v): return None
    if hasattr(v,"tolist"): return v.tolist()
    return v
def run(name,q):
    try:
        t=Gaia.launch_job(q).get_results()
        rows=[{k:conv(r[k]) for k in t.colnames} for r in t]
        res[name]=rows; print(name,len(rows))
        for r in rows: print(json.dumps(r,default=str))
    except Exception as e: print(name,"FAIL",e); res[name]=f"FAIL {e}"
run("gaia_source",f"SELECT g.source_id,g.ra,g.dec,g.parallax,g.parallax_error,g.pmra,g.pmdec,g.ruwe,g.phot_g_mean_mag,g.bp_rp,g.radial_velocity,g.radial_velocity_error,g.rv_nb_transits,g.rv_amplitude_robust,g.rv_chisq_pvalue,g.rv_renormalised_gof,g.non_single_star,g.ipd_gof_harmonic_amplitude,g.ipd_frac_multi_peak,g.astrometric_excess_noise,g.astrometric_excess_noise_sig,g.phot_variable_flag,g.teff_gspphot,g.logg_gspphot,a.radius_flame,a.mass_flame,a.age_flame,a.lum_flame FROM gaiadr3.gaia_source AS g LEFT JOIN gaiadr3.astrophysical_parameters AS a ON g.source_id=a.source_id WHERE g.source_id={SID}")
run("nss_two_body_orbit",f"SELECT * FROM gaiadr3.nss_two_body_orbit WHERE source_id={SID}")
run("nss_acceleration_astro",f"SELECT * FROM gaiadr3.nss_acceleration_astro WHERE source_id={SID}")
run("nss_non_linear_spectro",f"SELECT * FROM gaiadr3.nss_non_linear_spectro WHERE source_id={SID}")
run("nss_vim_fl",f"SELECT * FROM gaiadr3.nss_vim_fl WHERE source_id={SID}")
run("vari_classifier_result",f"SELECT * FROM gaiadr3.vari_classifier_result WHERE source_id={SID}")
run("vari_rotation_modulation",f"SELECT * FROM gaiadr3.vari_rotation_modulation WHERE source_id={SID}")
json.dump(res,open("data/gaia_nss.json","w"),indent=1,default=str)
