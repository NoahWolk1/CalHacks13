import warnings; warnings.filterwarnings("ignore")
from astroquery.gaia import Gaia
import numpy as np
from common import RA, DEC
q=f"""SELECT source_id, ra, dec, pmra, pmdec, parallax, phot_g_mean_mag, phot_rp_mean_mag, ruwe, non_single_star,
 DISTANCE(POINT({RA},{DEC}), POINT(ra,dec))*3600 AS sep
 FROM gaiadr3.gaia_source WHERE 1=CONTAINS(POINT(ra,dec), CIRCLE({RA},{DEC}, 0.03333333)) ORDER BY sep"""
t=Gaia.launch_job(q).get_results()
t.write("data/gaia_2arcmin.csv",overwrite=True)
g0=t["phot_g_mean_mag"][0]; print("N",len(t),"target G",g0)
t["dG"]=t["phot_g_mean_mag"]-g0
t["needed_eclipse_for_1p14ppt"]=1.14e-3/10**(-0.4*t["dG"])
print(t["source_id","sep","phot_g_mean_mag","dG","ruwe","needed_eclipse_for_1p14ppt"][t["dG"]<8].pformat(max_lines=-1))
