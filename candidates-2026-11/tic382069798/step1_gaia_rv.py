"""Is rv_amplitude_robust 25.2 km/s / p 0.14 unusual? Compare with Gaia DR3 stars of the same grvs_mag, template Teff and transit count."""
import warnings; warnings.filterwarnings("ignore")
from astroquery.gaia import Gaia
import numpy as np, json
q="""SELECT rv_amplitude_robust, radial_velocity_error, rv_chisq_pvalue, rv_nb_transits, rv_renormalised_gof FROM gaiadr3.gaia_source
WHERE grvs_mag BETWEEN 11.8 AND 12.0 AND rv_template_teff BETWEEN 4500 AND 5000 AND rv_nb_transits BETWEEN 12 AND 22 AND rv_method_used=1 AND random_index<20000000"""
c=Gaia.launch_job_async(q).get_results()
a=np.array(c["rv_amplitude_robust"],float); e=np.array(c["radial_velocity_error"],float); p=np.array(c["rv_chisq_pvalue"],float)
out=dict(n=len(a),amp_median=float(np.nanmedian(a)),amp_p84=float(np.nanpercentile(a,84)),amp_p95=float(np.nanpercentile(a,95)),frac_amp_ge_25p2=float(np.nanmean(a>=25.24)),
   err_median=float(np.nanmedian(e)),frac_p_le_0p14=float(np.nanmean(p<=0.1444)),frac_p_lt_0p01=float(np.nanmean(p<0.01)))
print(out); json.dump(out,open("data/step1_gaia_rv.json","w"),indent=1)
