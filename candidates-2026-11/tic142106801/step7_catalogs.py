import warnings, sys; warnings.filterwarnings("ignore")
import requests
from common import RA, DEC, TIC
def get(url, **kw):
    try: r=requests.get(url, timeout=60, **kw); return f"[{r.status_code}] "+r.text
    except Exception as e: return f"ERR {type(e).__name__} {e}"
for url in ["https://simbad.cfa.harvard.edu/simbad/sim-coo","https://simbad.cds.unistra.fr/simbad/sim-coo"]:
    t=get(url,params={"Coord":f"{RA} {DEC}","Radius":"20","Radius.unit":"arcsec","output.format":"ASCII"})
    print("==",url); print(t[:2500]); sys.stdout.flush()
    if t.startswith("[200]"): break
t=get("https://www.aavso.org/vsx/index.php",params={"view":"api.list","ra":RA,"dec":DEC,"radius":0.02,"format":"json"})
print("== AAVSO VSX api (72\"):",t[:2000]); sys.stdout.flush()
for host in ["vizier.cfa.harvard.edu","vizier.cds.unistra.fr"]:
    for cat in ["B/vsx/vsx","J/ApJS/258/16","I/358/vclassre"]:
        t=get(f"https://{host}/viz-bin/asu-tsv",params={"-source":cat,"-c":f"{RA} {DEC}","-c.rs":"30"})
        rows=[l for l in t.splitlines() if l and not l.startswith("#")]
        print(host,cat,t[:60].replace("\n"," ") if not t.startswith("[200]") else (rows[3:8] if len(rows)>3 else "no rows"),flush=True)
for url in [f"https://exofop.ipac.caltech.edu/tess/target.php?id={TIC}&json",
            "https://exofop.ipac.caltech.edu/tess/download_toi.php?sort=toi&output=pipe",
            "https://exofop.ipac.caltech.edu/tess/download_ctoi.php?sort=ctoi&output=pipe"]:
    t=get(url)
    if "json" in url: print("== ExoFOP target json:", t[:2500]); open("data/exofop.json","w").write(t[6:])
    else: print("==",url.split('/')[-1][:16], "lines", len(t.splitlines()), "hits", [l for l in t.splitlines() if TIC in l])
    sys.stdout.flush()
