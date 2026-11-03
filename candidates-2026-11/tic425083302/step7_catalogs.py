"""SIMBAD (cone 15"), AAVSO VSX API (72"), VizieR (VSX, TESS EB, OGLE LMC EBs, Gaia vari), ExoFOP target JSON + TOI/CTOI lists. Read only."""
import warnings, sys, json; warnings.filterwarnings("ignore")
import requests
from common import RA, DEC, TIC
def get(url, **kw):
    try: r=requests.get(url, timeout=60, **kw); return r.text
    except Exception as e: return f"ERR {type(e).__name__} {e}"
for url in ["https://simbad.cfa.harvard.edu/simbad/sim-coo","https://simbad.cds.unistra.fr/simbad/sim-coo"]:
    t=get(url,params={"Coord":f"{RA} {DEC}","Radius":"15","Radius.unit":"arcsec","output.format":"ASCII"})
    print("==",url); print(t[:5000]); sys.stdout.flush()
    if not t.startswith("ERR") and "error" not in t[:200].lower(): break
t=get("https://www.aavso.org/vsx/index.php",params={"view":"api.list","ra":RA,"dec":DEC,"radius":0.02,"format":"json"})
print("== AAVSO VSX api (72\"):",t[:3000]); sys.stdout.flush()
from astroquery.vizier import Vizier
from astropy.coordinates import SkyCoord; import astropy.units as u
c=SkyCoord(RA*u.deg,DEC*u.deg)
cats=[("B/vsx/vsx","VSX"),("J/ApJS/258/16","TESS EB Prsa+2022"),("I/358/vclassre","Gaia DR3 vari classifier"),
      ("J/AcA/66/421","OGLE-IV LMC eclipsing binaries (Pawlak+2016)"),("J/AcA/61/103","OGLE-III LMC EBs (Graczyk+2011)"),
      ("III/284","APOGEE DR17?"),("J/MNRAS/464/1299","?")]
for server in ["vizier.cfa.harvard.edu","vizier.cds.unistra.fr"]:
    try:
        V=Vizier(row_limit=50, timeout=60, columns=["**","_r"]); V.VIZIER_SERVER=server
        for cat,name in cats[:5]:
            try:
                r=V.query_region(c,radius=30*u.arcsec,catalog=cat)
                print("==",server,name,cat,"tables",len(r))
                for x in r: x.sort("_r"); print("\n".join(x[:5].pformat(max_width=250)))
            except Exception as e: print(server,cat,"ERR",str(e)[:120])
            sys.stdout.flush()
        r=V.query_region(c,radius=3*u.arcsec)
        print("== all VizieR tables with a source within 3\":",len(r))
        for k in r.keys(): print("  ",k, len(r[k]))
        break
    except Exception as e: print(server,"ERR",str(e)[:150])
for url in [f"https://exofop.ipac.caltech.edu/tess/target.php?id={TIC}&json",
            "https://exofop.ipac.caltech.edu/tess/download_toi.php?sort=toi&output=pipe",
            "https://exofop.ipac.caltech.edu/tess/download_ctoi.php?sort=ctoi&output=pipe"]:
    t=get(url)
    if "json" in url: print("== ExoFOP target json:", t[:3000]); open("data/exofop.json","w").write(t)
    else: print("==",url.split('/')[-1][:16], "lines", len(t.splitlines()), "hits", [l for l in t.splitlines() if TIC in l])
    sys.stdout.flush()
