import warnings; warnings.filterwarnings("ignore")
from astroquery.mast import Catalogs
import json
from astropy.coordinates import SkyCoord; import astropy.units as u
t = Catalogs.query_criteria(catalog="TIC", ID=149107538)
r = t[0]
out = {k: (None if str(r[k])=="--" else (r[k].item() if hasattr(r[k],"item") else str(r[k]))) for k in r.colnames}
keys=["ID","ra","dec","pmRA","pmDEC","Tmag","Vmag","Jmag","Hmag","Kmag","GAIAmag","gaiabp","gaiarp","Teff","e_Teff","logg","rad","e_rad","mass","e_mass","rho","e_rho","d","e_d","plx","e_plx","GAIA","contratio","disposition","duplicate_id","ebv","lumclass","objType","TWOMASS","splists","MH","PMflag","prox","numcont"]
for k in keys: print(k, out.get(k))
json.dump(out, open("data/tic.json","w"), indent=1, default=str)
n=Catalogs.query_region(SkyCoord(out["ra"],out["dec"],unit="deg"),radius=90*u.arcsec,catalog="TIC")
n.sort("dstArcSec")
print(n["ID","dstArcSec","Tmag","Teff","rad","GAIA","disposition","objType","plx"].pformat(max_lines=-1,max_width=-1))
n.write("data/tic_90arcsec.csv",overwrite=True)
