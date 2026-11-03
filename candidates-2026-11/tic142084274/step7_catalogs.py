import warnings; warnings.filterwarnings("ignore")
import json, requests
from astroquery.simbad import Simbad
from astroquery.vizier import Vizier
from astropy.coordinates import SkyCoord; import astropy.units as u
c=SkyCoord(98.12203*u.deg,-74.85380*u.deg)
out={}
try:
    s=Simbad.query_region(c,radius=30*u.arcsec); out["simbad"]=None if s is None else [str(x) for x in s[s.colnames[0]]]
    print("SIMBAD 30\":", s)
except Exception as e: out["simbad"]=f"ERR {e}"; print(out["simbad"])
V=Vizier(columns=["**","+_r"]); 
for cat,rad in [("B/vsx/vsx",60),("J/AJ/161/171",60),("J/ApJS/258/16",60),("I/358/vclassre",10),("J/MNRAS/519/3546",30)]:
    try:
        r=V.query_region(c,radius=rad*u.arcsec,catalog=cat); out[cat]=[len(t) for t in r]; print(cat,"->",r if len(r) else "none")
    except Exception as e: out[cat]=f"ERR {e}"; print(cat,"ERR",e)
try:
    j=requests.get("https://exofop.ipac.caltech.edu/tess/target.php?id=142084274&json",timeout=60).json()
    out["exofop_keys"]=list(j.keys())
    for k in ["tois","ctois","imaging","spectroscopy","time_series","planet_parameters","tags","stellar_companions","notes","files"]:
        if k in j: print("ExoFOP",k,":",json.dumps(j[k])[:400]); out["exofop_"+k]=j[k]
    print("basic:",json.dumps(j.get("basic_info",{}))[:600])
except Exception as e: out["exofop"]=f"ERR {e}"; print(out["exofop"])
json.dump(out,open("data/step7_catalogs.json","w"),indent=1,default=str)
