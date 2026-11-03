"""SIMBAD (CfA mirror) TAP: all radial-velocity and rotation measurements of TYC 8878-791-1."""
import requests, json
q="""SELECT v.* FROM mesVelocities v JOIN ident i ON v.oidref=i.oidref WHERE i.id='TIC 149107538'"""
q2="""SELECT r.* FROM mesRot r JOIN ident i ON r.oidref=i.oidref WHERE i.id='TIC 149107538'"""
out={}
for k,qq in [("velocities",q),("rotation",q2)]:
    for base in ["https://simbad.cfa.harvard.edu/simbad/sim-tap/sync","https://simbad.cds.unistra.fr/simbad/sim-tap/sync"]:
        try:
            t=requests.get(base,params={"request":"doQuery","lang":"adql","format":"text","query":qq},timeout=60).text
            print("==",k,base); print(t); out[k]=t; break
        except Exception as e: print(base,"ERR",e)
json.dump(out,open("data/step7_simbad_mes.json","w"),indent=1)
