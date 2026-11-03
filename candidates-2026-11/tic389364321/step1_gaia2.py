import warnings; warnings.filterwarnings("ignore")
from astropy.table import Table
from astroquery.gaia import Gaia
r=Table.read("data/gaia_2arcmin.csv"); t=r[0]
for c in r.colnames: print(c, t[c])
sid=t['source_id']
for tb in ["astrophysical_parameters","vari_summary","nss_two_body_orbit","vari_ms_oscillator","vari_classifier_result"]:
    try:
        x=Gaia.launch_job_async(f"SELECT * FROM gaiadr3.{tb} WHERE source_id={sid}").get_results()
        print("==",tb, len(x))
        if len(x):
            for c in x.colnames:
                v=x[c][0]
                if str(v) not in ('--','nan','') : print("  ",c,v)
    except Exception as e: print(tb,"ERR",e)
