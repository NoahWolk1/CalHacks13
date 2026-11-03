import warnings; warnings.filterwarnings("ignore")
import lightkurve as lk, json
from astroquery.mast import Catalogs
t = Catalogs.query_criteria(catalog="TIC", ID=177117017); r=t[0]
keys = ["ID","ra","dec","pmRA","pmDEC","Tmag","Vmag","GAIAmag","Teff","e_Teff","logg","rad","mass","rho","d","GAIA","contratio","disposition","duplicate_id","lumclass","objType","Jmag","Kmag"]
out = {k: (None if str(r[k])=="--" else (r[k].item() if hasattr(r[k],"item") else str(r[k]))) for k in keys if k in r.colnames}
print(json.dumps(out, indent=1, default=str)); json.dump(out, open("data/tic.json","w"), indent=1, default=str)
# TIC neighbours within 2'
n = Catalogs.query_region(f"{r['ra']} {r['dec']}", radius=2/60, catalog="TIC")
n.sort("dstArcSec")
print(n["ID","Tmag","dstArcSec","GAIA","Teff","rad","d","disposition"][:15])
n["ID","ra","dec","Tmag","dstArcSec","GAIA","Teff","rad","d"].write("data/tic_2arcmin.csv",overwrite=True)
sr = lk.search_lightcurve("TIC 177117017")
print(sr.table["mission","author","exptime","target_name"].pformat(max_lines=-1))
print(lk.search_tesscut("TIC 177117017"))
