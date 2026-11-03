"""SIMBAD measurements (ROT, velocities, V*, Fe_H) for the target; ASAS-SN variable classification."""
import requests, json
out={}
q="""SELECT mesrot.* FROM mesrot JOIN ident ON mesrot.oidref=ident.oidref WHERE ident.id='TIC 149538842'"""
for tab in ["mesrot","mesvelocities","mesvar","mesfe_h"]:
    for host in ["https://simbad.cfa.harvard.edu/simbad/sim-tap/sync","https://simbad.u-strasbg.fr/simbad/sim-tap/sync"]:
        try:
            t=requests.get(host,params={"request":"doQuery","lang":"adql","format":"tsv","query":q.replace("mesrot",tab)},timeout=40).text
            print("==",tab); print(t[:1500]); out[tab]=t[:3000]; break
        except Exception as e: print(tab,host,"ERR",type(e).__name__)
json.dump(out,open("data/step7_catalogs2.json","w"),indent=1)
