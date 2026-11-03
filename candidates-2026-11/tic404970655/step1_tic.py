import warnings; warnings.filterwarnings("ignore")
import json
from astroquery.mast import Catalogs
from common import TIC, RA, DEC
r=Catalogs.query_region(f"{RA} {DEC}", radius=0.0167, catalog="TIC")
r.sort('dstArcSec')
print(r['ID','Tmag','GAIAmag','Teff','rad','d','plx','dstArcSec','GAIA','objType','disposition'][:15].pformat(max_width=200))
t=r[r['ID']==TIC]
keep=['ID','ra','dec','Tmag','e_Tmag','Vmag','Bmag','Jmag','Hmag','Kmag','GAIAmag','gaiabp','gaiarp','Teff','logg','rad','mass','rho','lum','d','e_d','plx','e_plx','pmRA','pmDEC','lumclass','objType','typeSrc','contratio','GAIA','TWOMASS','TYC','HIP','disposition','duplicate_id','priority','MH','ebv','splists','dstArcSec']
d={k:str(t[k][0]) for k in keep if k in t.colnames}
for k,v in d.items(): print(k,v)
json.dump(d, open("data/tic.json","w"), indent=1)
