import warnings; warnings.filterwarnings("ignore")
from astroquery.simbad import Simbad
from astroquery.vizier import Vizier
from astropy.coordinates import SkyCoord; import astropy.units as u
c=SkyCoord(91.79969,-61.99722,unit="deg")
Simbad.SIMBAD_URL="https://simbad.cfa.harvard.edu/simbad/sim-tap"  # mirror
try:
    Simbad.server="simbad.harvard.edu"
    r=Simbad.query_region(c,radius=1*u.arcmin); print(r)
    print(Simbad.query_objectids("TOI-220"))
except Exception as e: print("SIMBAD ERR",e)
from astroquery.vizier import conf; conf.server="vizier.cfa.harvard.edu"
for cat in ["B/vsx/vsx","I/358/vclassre"]:
    try: print(cat, Vizier(catalog=cat).query_region(c,radius=2*u.arcmin))
    except Exception as e: print(cat,"ERR",e)
