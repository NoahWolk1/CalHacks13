"""SIMBAD bibliography of UCAC4 110-012461 (CfA TAP)."""
import requests, json
q="""SELECT r.bibcode, r.title FROM has_ref h JOIN ref r ON r.oidbib=h.oidbibref JOIN basic b ON b.oid=h.oidref WHERE b.main_id='UCAC4 110-012461'"""
r=requests.get("https://simbad.cfa.harvard.edu/simbad/sim-tap/sync",params=dict(request="doQuery",lang="adql",format="csv",query=q),timeout=60)
print(r.text); json.dump(dict(refs=r.text),open("data/step7_catalogs3.json","w"),indent=1)
