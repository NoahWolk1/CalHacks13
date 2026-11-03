import warnings; warnings.filterwarnings("ignore")
from astroquery.mast import Catalogs
import json
r=Catalogs.query_criteria(catalog="Tic", ID=167889402)
keys=["ID","ra","dec","Tmag","Vmag","Kmag","Teff","e_Teff","logg","e_logg","rad","e_rad","mass","e_mass","rho","e_rho","d","e_d","lumclass","contratio","GAIA","HIP","TYC","plx","pmRA","pmDEC","disposition","duplicate_id","MH"]
d={k:(r[k][0].item() if hasattr(r[k][0],'item') else str(r[k][0])) for k in keys if k in r.colnames}
print(json.dumps(d,indent=1,default=str)); json.dump(d,open("data/tic.json","w"),indent=1,default=str)
