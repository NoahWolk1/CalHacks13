import warnings; warnings.filterwarnings("ignore")
from astroquery.gaia import Gaia
from astropy.table import Table
r=Table.read("data/gaia_2arcmin.csv"); sid=r['source_id'][0]
for t in ["astrophysical_parameters","vari_summary","vari_classifier_result","nss_two_body_orbit","nss_acceleration_astro","vari_eclipsing_binary"]:
    x=Gaia.launch_job_async(f"SELECT * FROM gaiadr3.{t} WHERE source_id={sid}").get_results()
    print("==",t,len(x))
    if len(x):
        for c in x.colnames:
            v=x[c][0]
            if str(v) not in ('--','nan','') and (t!='astrophysical_parameters' or any(k in c for k in ['teff','logg','radius','mass','age','lum','mh_','evol','spectraltype','classprob_dsc_combmod_star','classprob_dsc_combmod_binary','distance'])): print("  ",c,v)
ids=",".join(str(s) for s in r['source_id'][r['phot_g_mean_mag']<19.5])
for t in ["nss_two_body_orbit","nss_acceleration_astro","nss_non_linear_spectro","vari_eclipsing_binary","vari_summary"]:
    x=Gaia.launch_job_async(f"SELECT source_id FROM gaiadr3.{t} WHERE source_id IN ({ids})").get_results()
    print("neighbours (G<19.5) in",t,list(x['source_id']))
print("n neighbours G<19.5:",(r['phot_g_mean_mag']<19.5).sum()-1)
print(r['source_id','sep','phot_g_mean_mag','ruwe','non_single_star','parallax'][r['phot_g_mean_mag']<19.5].pformat(max_lines=60))
