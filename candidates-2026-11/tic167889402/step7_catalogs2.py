"""Follow-up: SIMBAD components of HD 53500 (a catalogued double), their identifiers and measurements; VizieR via CDS; ExoFOP retry."""
import json, requests
from common import RA, DEC, TIC
T=60; out={}
def tap(q):
    r=requests.get("https://simbad.cfa.harvard.edu/simbad/sim-tap/sync",params=dict(request="doQuery",lang="adql",format="text",query=q),timeout=T); return r.text
print(tap(f"SELECT main_id, ra, dec, otype, sp_type, flux FROM basic LEFT JOIN flux ON oidref=oid AND filter='V' WHERE main_id IN ('HD  53500A','HD  53500B','HD  53500')"))
print(tap("SELECT b.main_id, i.id FROM ident i JOIN basic b ON i.oidref=b.oid WHERE b.main_id IN ('HD  53500A','HD  53500B','HD  53500')"))
print(tap("SELECT b.main_id, r.bibcode FROM has_ref r JOIN basic b ON r.oidref=b.oid WHERE b.main_id IN ('HD  53500A','HD  53500B','HD  53500')"))
for cat,rad in [("B/wds/wds",30),("B/vsx/vsx",120),("J/A+A/657/A7/tablea1",5),("J/ApJS/254/42/hgca",5),("I/311/hip2",5),("B/sb9/main",10),("J/ApJS/258/16",60)]:
    for host in ["vizier.cds.unistra.fr","vizier.u-strasbg.fr"]:
        try:
            r=requests.get(f"https://{host}/viz-bin/asu-tsv",params={"-source":cat,"-c":f"{RA} {DEC}","-c.rs":rad,"-out.max":20,"-out.all":""},timeout=T)
            if r.status_code!=200: print(host,cat,"HTTP",r.status_code); continue
            rows=[l for l in r.text.splitlines() if l and not l.startswith("#")]
            print(f"VizieR {host} {cat}: {len(rows)} lines"); [print("   ",l[:500]) for l in rows[:8]]; out[cat]=rows; break
        except Exception as e: print("VizieR",host,cat,"ERR",e)
try:
    j=requests.get(f"https://exofop.ipac.caltech.edu/tess/target.php?id={TIC}&json",timeout=T).json(); json.dump(j,open("data/exofop.json","w"),indent=1)
    for k in ["tois","ctois","imaging","spectroscopy","stellar_companions","notes","confirmed_planets","tags"]:
        if k in j: print("ExoFOP",k,":",json.dumps(j[k])[:500])
except Exception as e: print("ExoFOP ERR",e)
json.dump(out,open("data/step7_catalogs2.json","w"),indent=1)
