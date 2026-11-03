"""SIMBAD (CfA mirror): parents (memberships), object types and the bibliography of UCAC4 110-012461; VizieR retry."""
import requests, json
out={}
base="https://simbad.cfa.harvard.edu/simbad/sim-tap/sync"
qs={"parents":"""SELECT p.main_id, p.otype, h.membership FROM h_link h JOIN basic p ON p.oid=h.parent JOIN basic c ON c.oid=h.child WHERE c.main_id='UCAC4 110-012461'""",
    "otypes":"""SELECT o.otype, o.origin FROM otypes o JOIN basic b ON b.oid=o.oidref WHERE b.main_id='UCAC4 110-012461'""",
    "refs":"""SELECT r.bibcode, r.title FROM has_ref h JOIN ref r ON r.oidbibref=h.oidbibref JOIN basic b ON b.oid=h.oidref WHERE b.main_id='UCAC4 110-012461'"""}
for k,q in qs.items():
    try:
        r=requests.get(base,params=dict(request="doQuery",lang="adql",format="csv",query=q),timeout=60); out[k]=r.text; print("==",k,r.status_code); print(r.text[:3000])
    except Exception as e: out[k]=f"ERR {e}"; print(k,"ERR",e)
for host in ["vizier.cds.unistra.fr","vizier.iucaa.in"]:
    for cat,rad in [("B/vsx/vsx",60),("J/ApJS/258/16",60)]:
        try:
            t=requests.get(f"https://{host}/viz-bin/asu-tsv",params={"-source":cat,"-c":"98.0332440 -68.1783295","-c.rs":str(rad)},timeout=40)
            rows=[l for l in t.text.splitlines() if l and not l.startswith("#")]; ok=t.status_code==200 and "html" not in t.text[:200].lower()
            out[f"{host} {cat}"]=rows[:10] if ok else f"HTTP {t.status_code}"; print(host,cat,out[f"{host} {cat}"])
        except Exception as e: out[f"{host} {cat}"]=f"ERR {type(e).__name__}"; print(host,cat,"ERR",type(e).__name__)
json.dump(out,open("data/step7_catalogs2.json","w"),indent=1)
