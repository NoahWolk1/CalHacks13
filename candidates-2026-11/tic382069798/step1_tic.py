import warnings; warnings.filterwarnings("ignore")
from astroquery.mast import Catalogs
import json
from astropy.coordinates import SkyCoord; import astropy.units as u
from common import *
t = Catalogs.query_criteria(catalog="TIC", ID=TIC); r=t[0]
out = {k: (None if str(r[k])=="--" else (r[k].item() if hasattr(r[k],"item") else str(r[k]))) for k in r.colnames}
for k in ["ID","ra","dec","pmRA","pmDEC","Tmag","Vmag","Jmag","Hmag","Kmag","GAIAmag","gaiabp","gaiarp","Teff","e_Teff","logg","rad","e_rad","mass","rho","d","e_d","plx","GAIA","contratio","disposition","lumclass","ebv","MH","numcont"]: print(k, out.get(k))
json.dump(out, open("data/tic.json","w"), indent=1, default=str)
n=Catalogs.query_region(SkyCoord(RA,DEC,unit="deg"),radius=120*u.arcsec,catalog="TIC"); n.sort("dstArcSec")
print(n["ID","dstArcSec","Tmag","Teff","rad","GAIA","disposition","objType"][:25].pformat(max_lines=-1,max_width=-1))
n.write("data/tic_120arcsec.csv",overwrite=True)
