import warnings; warnings.filterwarnings("ignore")
import json
from astroquery.mast import Catalogs
r=Catalogs.query_object("TIC 142106801", radius=0.001, catalog="TIC")
r=r[r['ID']=='142106801']
keep=['ID','ra','dec','Tmag','Vmag','Bmag','Jmag','Hmag','Kmag','GAIAmag','Teff','logg','rad','mass','rho','d','plx','e_plx','pmRA','pmDEC','lumclass','objType','contratio','GAIA','TWOMASS','TYC','disposition','MH','ebv','splists']
d={k:(r[k][0].item() if hasattr(r[k][0],'item') else r[k][0]) for k in keep if k in r.colnames}
for k,v in d.items(): print(k,v)
json.dump({k:str(v) for k,v in d.items()}, open("data/tic.json","w"), indent=1)
