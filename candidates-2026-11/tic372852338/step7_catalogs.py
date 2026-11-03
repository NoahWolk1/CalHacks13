"""Prior knowledge (read-only): ExoFOP target JSON, TOI and CTOI lists, AAVSO VSX API, SIMBAD TAP (CfA then CDS), VizieR VSX / TESS EB (CfA then CDS)."""
import warnings; warnings.filterwarnings("ignore")
import json, requests
from astroquery.vizier import Vizier
from astropy.coordinates import SkyCoord; import astropy.units as u
from common import RA, DEC, TIC
c=SkyCoord(RA*u.deg,DEC*u.deg); out={}
try:
    j=requests.get(f"https://exofop.ipac.caltech.edu/tess/target.php?id={TIC}&json",timeout=60).json()
    for k in ["tois","ctois","imaging","spectroscopy","time_series","stellar_companions","confirmed_planets","aliases","tags","notes"]:
        if k in j: print("ExoFOP",k,":",json.dumps(j[k])[:400]); out["exofop_"+k]=j[k]
except Exception as e: out["exofop"]=f"ERR {e}"; print("ExoFOP ERR",e)
for name,url in [("toi","https://exofop.ipac.caltech.edu/tess/download_toi.php?sort=toi&output=csv"),("ctoi","https://exofop.ipac.caltech.edu/tess/download_ctoi.php?sort=ctoi&output=csv")]:
    try:
        lines=requests.get(url,timeout=120).text.splitlines()
        hit=[l for l in lines if TIC in l.split(",")[:3] or f'"{TIC}"' in l[:40]]
        out[name]=dict(n_lines=len(lines),hits=hit); print(name,len(lines),"lines; hits:",hit[:3])
    except Exception as e: out[name]=f"ERR {e}"; print(name,"ERR",e)
try:
    r=requests.get("https://www.aavso.org/vsx/index.php",params=dict(view="api.list",ra=RA,dec=DEC,radius=90/3600,format="json"),timeout=60)
    out["aavso_vsx_90arcsec"]=r.text[:4000]; print("AAVSO VSX 90\":",r.text[:1500])
except Exception as e: out["aavso_vsx"]=f"ERR {e}"; print("VSX ERR",e)
for url in ["https://simbad.cfa.harvard.edu/simbad/sim-tap/sync","https://simbad.u-strasbg.fr/simbad/sim-tap/sync"]:
    try:
        q=f"SELECT main_id, otype, sp_type, rvz_radvel, DISTANCE(POINT('ICRS',ra,dec),POINT('ICRS',{RA},{DEC}))*3600 AS sep FROM basic WHERE CONTAINS(POINT('ICRS',ra,dec),CIRCLE('ICRS',{RA},{DEC},0.02))=1 ORDER BY sep"
        r=requests.get(url,params=dict(request="doQuery",lang="adql",format="csv",query=q),timeout=60)
        print("SIMBAD",url,r.status_code,r.text[:800])
        if r.status_code==200: out["simbad"]=r.text; break
    except Exception as e: print("SIMBAD ERR",url,str(e)[:150])
for srv in ["vizier.cfa.harvard.edu","vizier.cds.unistra.fr"]:
    V=Vizier(columns=["**","+_r"]); V.VIZIER_SERVER=srv; V.TIMEOUT=60; ok=True
    for cat,rad in [("B/vsx/vsx",90),("J/ApJS/258/16",60)]:
        try:
            r=V.query_region(c,radius=rad*u.arcsec,catalog=cat); out[srv+":"+cat]=[[list(map(str,row)) for row in t] for t in r]; print(srv,cat,"->",r[0] if len(r) else "none")
        except Exception as e: out[srv+":"+cat]=f"ERR {str(e)[:150]}"; print(srv,cat,"ERR",str(e)[:150]); ok=False
    if ok: break
json.dump(out,open("data/step7_catalogs.json","w"),indent=1,default=str)
