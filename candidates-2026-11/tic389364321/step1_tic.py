import warnings; warnings.filterwarnings("ignore")
import json
from astroquery.mast import Catalogs
r=Catalogs.query_object("TIC 389364321", radius=0.001, catalog="TIC")
r=r[r['ID']=='389364321']
keep=['ID','ra','dec','Tmag','Vmag','Bmag','Jmag','Hmag','Kmag','GAIAmag','Teff','logg','rad','mass','rho','d','plx','e_plx','pmRA','pmDEC','lumclass','objType','contratio','GAIA','TWOMASS','HIP','TYC','disposition','priority','MH','ebv','splists']
d={k:(None if hasattr(r[k][0],'mask') and r[k][0] is None else (r[k][0].item() if hasattr(r[k][0],'item') else r[k][0])) for k in keep if k in r.colnames}
for k,v in d.items(): print(k,v)
json.dump({k:(str(v) if v is not None else None) for k,v in d.items()}, open("data/tic.json","w"), indent=1)
