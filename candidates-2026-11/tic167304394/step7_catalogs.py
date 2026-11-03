"""Prior knowledge: SIMBAD (CfA mirror), VizieR (CfA mirror: VSX, TESS EB catalog, Gaia DR3 NSS/vari), AAVSO VSX API,
ExoFOP target JSON, TOI and CTOI lists. Read-only."""
import warnings; warnings.filterwarnings("ignore")
import json, requests, io, csv
from astroquery.simbad import Simbad
from astroquery.vizier import Vizier
from astropy.coordinates import SkyCoord; import astropy.units as u
from common import RA, DEC, TIC
c=SkyCoord(RA*u.deg,DEC*u.deg); out={}
Simbad.SIMBAD_URL="https://simbad.cfa.harvard.edu/simbad/sim-script"
try:
    Simbad.add_votable_fields("otype","sp")
except Exception: pass
try:
    s=Simbad.query_region(c,radius=30*u.arcsec); out["simbad"]=None if s is None else [list(map(str,r)) for r in s]; print("SIMBAD 30\":",s)
except Exception as e: out["simbad"]=f"ERR {e}"; print("SIMBAD ERR",e)
V=Vizier(columns=["**","+_r"]); V.VIZIER_SERVER="vizier.cfa.harvard.edu"
for cat,rad in [("B/vsx/vsx",60),("J/ApJS/258/16",60),("I/358/vclassre",5),("I/357/tbooc",5),("I/357/tbosb1",5),("I/357/tboeb",5),("I/357/tboasb1",5),("I/357/tbooac",5),("J/AJ/161/171",60),("II/366/catalog",30)]:
    try:
        r=V.query_region(c,radius=rad*u.arcsec,catalog=cat); out[cat]=[[list(map(str,row)) for row in t] for t in r]; print(cat,"->",r[0] if len(r) else "none")
    except Exception as e: out[cat]=f"ERR {e}"; print(cat,"ERR",e)
try:
    r=requests.get("https://www.aavso.org/vsx/index.php",params=dict(view="api.list",ra=RA,dec=DEC,radius=60/3600,format="json"),timeout=60)
    out["aavso_vsx"]=r.text[:2000]; print("AAVSO VSX:",r.text[:800])
except Exception as e: out["aavso_vsx"]=f"ERR {e}"; print("VSX ERR",e)
try:
    j=requests.get(f"https://exofop.ipac.caltech.edu/tess/target.php?id={TIC}&json",timeout=60).json()
    for k in ["tois","ctois","imaging","spectroscopy","time_series","planet_parameters","tags","stellar_companions","notes","confirmed_planets","aliases","basic_info"]:
        if k in j: print("ExoFOP",k,":",json.dumps(j[k])[:500]); out["exofop_"+k]=j[k]
except Exception as e: out["exofop"]=f"ERR {e}"; print("ExoFOP ERR",e)
for name,url in [("toi","https://exofop.ipac.caltech.edu/tess/download_toi.php?sort=toi&output=csv"),("ctoi","https://exofop.ipac.caltech.edu/tess/download_ctoi.php?sort=ctoi&output=csv")]:
    try:
        txt=requests.get(url,timeout=120).text; lines=txt.splitlines()
        hit=[l for l in lines if l.split(",")[0].strip('"')==TIC or f",{TIC}," in l or l.startswith(TIC+",")]
        out[name]=dict(n_lines=len(lines),hits=hit); print(name,len(lines),"lines; hits:",hit[:3])
    except Exception as e: out[name]=f"ERR {e}"; print(name,"ERR",e)
json.dump(out,open("data/step7_catalogs.json","w"),indent=1,default=str)
