"""NSS orbits of the two neighbours flagged in step1 (T 10.65 at 111", T 14.0 at 83")."""
import warnings; warnings.filterwarnings("ignore")
from astroquery.gaia import Gaia
import json
out={}
for sid in [5280227575322856448,5280226613250205312]:
    x=Gaia.launch_job_async(f"SELECT source_id,nss_solution_type,period,period_error,eccentricity,t_periastron,semi_amplitude_primary,significance,goodness_of_fit FROM gaiadr3.nss_two_body_orbit WHERE source_id={sid}").get_results()
    y=Gaia.launch_job_async(f"SELECT source_id,phot_g_mean_mag,bp_rp,parallax,ruwe,radial_velocity,phot_variable_flag FROM gaiadr3.gaia_source WHERE source_id={sid}").get_results()
    out[str(sid)]=dict(nss=[{c:str(r[c]) for c in x.colnames} for r in x],src={c:str(y[c][0]) for c in y.colnames}); print(out[str(sid)])
json.dump(out,open("data/step1_gaia_nss.json","w"),indent=1)
