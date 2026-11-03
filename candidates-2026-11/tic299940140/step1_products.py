import warnings; warnings.filterwarnings("ignore")
import lightkurve as lk, json
from astroquery.mast import Catalogs
t = Catalogs.query_criteria(catalog="TIC", ID=299940140); r=t[0]
keys = ["ID","ra","dec","pmRA","pmDEC","Tmag","Vmag","GAIAmag","Teff","e_Teff","logg","e_logg","rad","e_rad","mass","e_mass","rho","e_rho","d","e_d","GAIA","contratio","disposition","duplicate_id","ebv","lumclass","objType","Jmag","Kmag"]
out = {k: (None if str(r[k])=="--" else (r[k].item() if hasattr(r[k],"item") else str(r[k]))) for k in keys if k in r.colnames}
print(json.dumps(out, indent=1, default=str)); json.dump(out, open("data/tic.json","w"), indent=1, default=str)
sr = lk.search_lightcurve("TIC 299940140")
print(sr.table["mission","author","exptime","target_name"].pformat(max_lines=-1))
print(lk.search_tesscut("TIC 299940140"))
