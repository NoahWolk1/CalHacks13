import warnings; warnings.filterwarnings("ignore")
from astroquery.gaia import Gaia
import numpy as np, json
x=Gaia.launch_job_async("SELECT * FROM gaiadr3.nss_two_body_orbit WHERE source_id=5267268250236345600").get_results()
r={}
for c in x.colnames:
    v=x[c][0]
    try: r[c]=None if np.ma.is_masked(v) else (v.item() if np.size(v)==1 and hasattr(v,"item") else str(v))
    except Exception: r[c]=str(v)
for k,v in r.items():
    if v is not None: print(k,v)
json.dump(r,open("data/gaia_nss_companion.json","w"),indent=1,default=str)
