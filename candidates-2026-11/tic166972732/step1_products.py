import warnings; warnings.filterwarnings("ignore")
import lightkurve as lk, json
from astroquery.mast import Catalogs
from common import TIC
t = Catalogs.query_criteria(catalog="TIC", ID=int(TIC)); r=t[0]
out = {k: (None if str(r[k])=="--" else (r[k].item() if hasattr(r[k],"item") else str(r[k]))) for k in r.colnames}
json.dump(out, open("data/tic.json","w"), indent=1, default=str)
for k in ["ID","ra","dec","pmRA","pmDEC","Tmag","Vmag","Jmag","Kmag","GAIAmag","Teff","e_Teff","logg","rad","mass","rho","d","plx","GAIA","contratio","disposition","lumclass","objType","duplicate_id","TWOMASS","splists","Bpmag","Rpmag","gaiabp","gaiarp","prox","numcont"]:
    print(k, out.get(k))
sr = lk.search_lightcurve(f"TIC {TIC}")
print(sr.table["mission","author","exptime","target_name"].pformat(max_lines=-1))
print(lk.search_tesscut(f"TIC {TIC}"))
