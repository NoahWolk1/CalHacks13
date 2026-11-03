"""Retry: Gaia DR3 NSS/variability tables for both components (ESA archive), VizieR on CDS and CfA, SIMBAD TAP on CfA."""
import warnings; warnings.filterwarnings("ignore")
import json, requests
from astroquery.gaia import Gaia
from astroquery.vizier import Vizier
from astropy.coordinates import SkyCoord; import astropy.units as u
from common import RA, DEC
c=SkyCoord(RA*u.deg,DEC*u.deg); out={}
IDS="5283324796495406336,5283324796501685888"
for tab in ["nss_two_body_orbit","nss_acceleration_astro","nss_non_linear_spectro","nss_vim_fl","vari_summary","vari_eclipsing_binary","vari_classifier_result"]:
    try:
        t=Gaia.launch_job_async(f"SELECT * FROM gaiadr3.{tab} WHERE source_id IN ({IDS})").get_results()
        out[tab]=[{k:str(r[k]) for k in t.colnames} for r in t]; print(tab,len(t),out[tab][:1])
    except Exception as e: out[tab]=f"ERR {e}"; print(tab,"ERR",str(e)[:200])
for srv in ["vizier.cds.unistra.fr","vizier.cfa.harvard.edu"]:
    V=Vizier(columns=["**","+_r"]); V.VIZIER_SERVER=srv; ok=True
    for cat,rad in [("B/vsx/vsx",60),("J/ApJS/258/16",60),("II/366/catalog",30)]:
        try:
            r=V.query_region(c,radius=rad*u.arcsec,catalog=cat); out[srv+":"+cat]=[[list(map(str,row)) for row in t] for t in r]; print(srv,cat,"->",r[0] if len(r) else "none")
        except Exception as e: out[srv+":"+cat]=f"ERR {str(e)[:150]}"; print(srv,cat,"ERR",str(e)[:150]); ok=False
    if ok: break
for url in ["https://simbad.cfa.harvard.edu/simbad/sim-tap/sync","https://simbad.u-strasbg.fr/simbad/sim-tap/sync"]:
    try:
        q=f"SELECT main_id, otype, sp_type, ra, dec, DISTANCE(POINT('ICRS',ra,dec),POINT('ICRS',{RA},{DEC}))*3600 AS sep FROM basic WHERE CONTAINS(POINT('ICRS',ra,dec),CIRCLE('ICRS',{RA},{DEC},0.0084))=1"
        r=requests.get(url,params=dict(request="doQuery",lang="adql",format="csv",query=q),timeout=60)
        out["simbad"]=r.text; print("SIMBAD",url,r.status_code,r.text[:600]); 
        if r.status_code==200: break
    except Exception as e: print("SIMBAD ERR",url,str(e)[:150])
json.dump(out,open("data/step7_catalogs2.json","w"),indent=1,default=str)
