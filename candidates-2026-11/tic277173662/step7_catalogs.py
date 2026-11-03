import warnings, sys, json; warnings.filterwarnings("ignore")
import requests
from common import TIC, RA, DEC
def get(url, **kw):
    try: r=requests.get(url, timeout=60, **kw); return r.text
    except Exception as e: return f"ERR {type(e).__name__} {e}"
for url in ["https://simbad.cfa.harvard.edu/simbad/sim-coo","https://simbad.cds.unistra.fr/simbad/sim-coo"]:
    t=get(url,params={"Coord":f"{RA} {DEC}","Radius":"20","Radius.unit":"arcsec","output.format":"ASCII","list.idsel":"on","list.bibsel":"off"})
    print("== SIMBAD",url); print(t[:6000]); sys.stdout.flush()
    if not t.startswith("ERR") and "error" not in t[:200].lower(): break
t=get("https://www.aavso.org/vsx/index.php",params={"view":"api.list","ra":RA,"dec":DEC,"radius":0.02,"format":"json"})
print("== AAVSO VSX api (72\"):",t[:3000]); sys.stdout.flush()
for url in [f"https://exofop.ipac.caltech.edu/tess/target.php?id={TIC}&json",
            "https://exofop.ipac.caltech.edu/tess/download_toi.php?sort=toi&output=pipe",
            "https://exofop.ipac.caltech.edu/tess/download_ctoi.php?sort=ctoi&output=pipe"]:
    t=get(url)
    if "json" in url:
        open("data/exofop.json","w").write(t)
        try:
            j=json.loads(t); print("== ExoFOP keys", list(j.keys()))
            for k in ["tois","ctois","imaging","spectroscopy","stellar_companions","tsfo","planet_parameters"]:
                print("  ",k, j.get(k) if not isinstance(j.get(k),list) else len(j.get(k)))
        except Exception as e: print("ExoFOP", t[:500])
    else: print("==",url.split('/')[-1][:16], "lines", len(t.splitlines()), "hits", [l for l in t.splitlines() if TIC in l])
    sys.stdout.flush()
