import warnings; warnings.filterwarnings("ignore")
import json
from astroquery.mast import Catalogs
from common import TIC, RA, DEC
r=Catalogs.query_object(f"{RA} {DEC}", radius=0.02, catalog="TIC")
r.sort('dstArcSec')
print(r['ID','ra','dec','Tmag','GAIAmag','Teff','rad','d','plx','dstArcSec','objType','disposition','GAIA'][:12].pformat(max_width=250))
r=r[r['ID']==TIC]
keep=['ID','ra','dec','Tmag','e_Tmag','Vmag','Bmag','Jmag','Hmag','Kmag','GAIAmag','gaiabp','gaiarp','Teff','logg','rad','mass','rho','lum','d','e_d','plx','e_plx','pmRA','pmDEC','lumclass','objType','contratio','GAIA','TWOMASS','HIP','TYC','disposition','duplicate_id','priority','MH','ebv','splists','dstArcSec']
d={}
for k in keep:
    if k in r.colnames:
        v=r[k][0]; d[k]=None if str(v) in ('--','nan') else (v.item() if hasattr(v,'item') else v)
for k,v in d.items(): print(k,v)
json.dump({k:(str(v) if v is not None else None) for k,v in d.items()}, open("data/tic.json","w"), indent=1)
