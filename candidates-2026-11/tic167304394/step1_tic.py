"""TIC stars within 1 arcmin and Gaia DR3 within 2 arcmin (position cross-match, since TIC 8.2 has no Gaia id)."""
import warnings; warnings.filterwarnings("ignore")
import numpy as np
from astroquery.mast import Catalogs
from astroquery.gaia import Gaia
from common import RA, DEC
#t=Catalogs.query_region(f"{RA} {DEC}",radius=1/60,catalog="TIC")
#t.sort("dstArcSec")
#print(t["ID","ra","dec","Tmag","GAIAmag","Teff","rad","mass","GAIA","objType","disposition","duplicate_id","dstArcSec","plx","pmRA"].pformat(max_lines=40,max_width=250))
q=f"""SELECT g.source_id, g.ra, g.dec, g.pmra, g.pmdec, g.parallax, g.parallax_error, g.phot_g_mean_mag, g.bp_rp, g.ruwe,
 g.non_single_star, g.ipd_frac_multi_peak, g.ipd_gof_harmonic_amplitude, g.astrometric_excess_noise_sig, g.duplicated_source,
 g.radial_velocity, g.radial_velocity_error, g.rv_nb_transits, g.rv_chisq_pvalue, g.rv_amplitude_robust, g.phot_variable_flag,
 g.teff_gspphot, g.logg_gspphot, g.distance_gspphot, a.radius_flame, a.mass_flame, a.age_flame, a.teff_gspspec, a.logg_gspspec,
 g.has_xp_continuous, a.classprob_dsc_combmod_binarystar,
 DISTANCE(POINT({RA},{DEC}), POINT(g.ra,g.dec))*3600 AS sep
 FROM gaiadr3.gaia_source AS g LEFT JOIN gaiadr3.astrophysical_parameters AS a ON g.source_id=a.source_id
 WHERE 1=CONTAINS(POINT(g.ra,g.dec), CIRCLE({RA},{DEC}, 0.0333333)) ORDER BY sep"""
g=Gaia.launch_job_async(q).get_results(); g.write("data/gaia_2arcmin.csv",overwrite=True,format="csv")
print(len(g))
for r in g[:8]:
    print({k:(None if np.ma.is_masked(r[k]) else r[k]) for k in g.colnames})
