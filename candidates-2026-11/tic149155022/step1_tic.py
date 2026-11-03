import warnings; warnings.filterwarnings("ignore")
from astroquery.mast import Catalogs
import json
from cfg import *
t = Catalogs.query_criteria(catalog="TIC", ID=TIC)
r = t[0]
out = {k: (None if str(r[k])=="--" else (r[k].item() if hasattr(r[k],"item") else str(r[k]))) for k in r.colnames}
keys=["ID","ra","dec","pmRA","pmDEC","Tmag","Vmag","Jmag","Hmag","Kmag","GAIAmag","gaiabp","gaiarp","Teff","e_Teff","logg","rad","e_rad","mass","e_mass","rho","e_rho","d","e_d","plx","e_plx","GAIA","contratio","disposition","duplicate_id","ebv","lumclass","objType","TWOMASS","splists","MH","PMflag","prox","numcont"]
for k in keys: print(k, out.get(k))
json.dump(out, open("data/tic.json","w"), indent=1, default=str)
c = Catalogs.query_region(f"{RA} {DEC}", radius=60/3600., catalog="TIC")
c=c[["ID","ra","dec","Tmag","Teff","rad","d","plx","GAIA","dstArcSec","disposition"]]
c.sort("dstArcSec"); print(c[:20].pformat(max_width=-1)); c.write("data/tic_60arcsec.csv",overwrite=True)
