import warnings, sys; warnings.filterwarnings("ignore")
import requests
RA,DEC=106.180320908444,-68.5710119785883
def get(url, **kw):
    try: return requests.get(url, timeout=45, **kw).text
    except Exception as e: return f"ERR {e}"
# SIMBAD TAP
q=f"SELECT main_id, otype, ra, dec, DISTANCE(POINT('ICRS',ra,dec),POINT('ICRS',{RA},{DEC}))*3600 AS sep FROM basic WHERE CONTAINS(POINT('ICRS',ra,dec),CIRCLE('ICRS',{RA},{DEC},0.0083))=1"
print("SIMBAD 30\":", get("https://simbad.cds.unistra.fr/simbad/sim-tap/sync", params=dict(request="doQuery",lang="adql",format="csv",query=q))[:1500])
# VizieR: VSX and others via TAP-free ASU
for cat in ["B/vsx/vsx","J/ApJS/258/16","I/358/vclassre","J/A+A/674/A16"]:
    t=get("https://vizier.cds.unistra.fr/viz-bin/asu-tsv", params={"-source":cat,"-c":f"{RA} {DEC}","-c.rs":"120","-out.max":"20"})
    lines=[l for l in t.splitlines() if l and not l.startswith("#")]
    print(cat, "rows (incl header lines):", len(lines)); print("\n".join(lines[:8]))
for url in ["https://exofop.ipac.caltech.edu/tess/target.php?id=299940140&json",
            "https://exofop.ipac.caltech.edu/tess/download_toi.php?sort=toi&output=pipe",
            "https://exofop.ipac.caltech.edu/tess/download_ctoi.php?sort=ctoi&output=pipe"]:
    t=get(url)
    if "json" in url: print("ExoFOP target json:", t[:2500])
    else: print(url.split('/')[-1][:16], "lines", len(t.splitlines()), "hits", [l for l in t.splitlines() if "299940140" in l])
    sys.stdout.flush()
