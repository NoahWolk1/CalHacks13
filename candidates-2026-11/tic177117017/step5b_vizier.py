import warnings; warnings.filterwarnings("ignore")
import json
from astroquery.vizier import Vizier
from astropy.coordinates import SkyCoord; import astropy.units as u
c=SkyCoord(103.92415503464*u.deg,-67.340521552983*u.deg)
out={}
for server in ["vizier.cfa.harvard.edu","vizier.iucaa.in","vizier.nao.ac.jp"]:
    try:
        V=Vizier(row_limit=50, timeout=60); V.VIZIER_SERVER=server
        for cat,name in [("B/vsx/vsx","VSX"),("J/ApJS/258/16","TESS EB catalog Prsa+2022"),("I/358/veb","Gaia DR3 vari_eclipsing_binary"),("I/358/vclassre","Gaia DR3 vari classifier"),("J/A+A/664/A107","?")][:4]:
            r=V.query_region(c,radius=2*u.arcmin,catalog=cat)
            out[name]=[x.pformat(max_width=200) for x in r]; print(server,name,len(r)); [print(x) for x in r]
        out["server"]=server; break
    except Exception as e: print(server,"ERR",str(e)[:150])
json.dump(out,open("data/step5b_vizier.json","w"),indent=1)
