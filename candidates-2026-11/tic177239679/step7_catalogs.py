"""ExoFOP (read-only), TOI and CTOI lists, AAVSO VSX, VizieR (CfA mirror: VSX, TESS EBs, WDS, Gaia DR3 NSS), SIMBAD (CfA mirror)."""
import json, requests, io
RA,DEC=105.20127450,-71.20768920
out={}
try:
    j=requests.get("https://exofop.ipac.caltech.edu/tess/target.php?id=177239679&json",timeout=60).json(); out["exofop_keys"]=list(j.keys())
    for k in ["tois","ctois","imaging","spectroscopy","time_series","planet_parameters","stellar_companions","tags","notes","files","confirmed_planets"]:
        if k in j: print("ExoFOP",k,":",json.dumps(j[k])[:300]); out["exofop_"+k]=j[k]
    print("ExoFOP basic:",json.dumps(j.get("basic_info",{}))[:500])
except Exception as e: out["exofop"]=f"ERR {e}"; print(out["exofop"])
for lab,url in [("TOI","https://exofop.ipac.caltech.edu/tess/download_toi.php?sort=toi&output=csv"),("CTOI","https://exofop.ipac.caltech.edu/tess/download_ctoi.php?sort=ctoi&output=csv")]:
    try:
        t=requests.get(url,timeout=90).text; L=t.splitlines(); hits=[l for l in L if "177239679" in l or "764904125" in l]
        print(lab,"list lines",len(L),"hits",hits); out[lab]=dict(lines=len(L),hits=hits)
    except Exception as e: print(lab,"ERR",e); out[lab]=f"ERR {e}"
try:
    t=requests.get("https://www.aavso.org/vsx/index.php",params={"view":"api.list","ra":RA,"dec":DEC,"radius":0.05,"format":"json"},timeout=40).text; print("AAVSO VSX 3':",t[:400]); out["vsx_api"]=t[:2000]
except Exception as e: print("AAVSO ERR",e); out["vsx_api"]=f"ERR {e}"
for host in ["vizier.cfa.harvard.edu","vizier.cds.unistra.fr"]:
    for cat,rad in [("B/vsx/vsx",120),("J/ApJS/258/16",120),("B/wds/wds",30),("I/357/tbosb1",10),("J/A+A/649/A6",10)]:
        try:
            t=requests.get(f"https://{host}/viz-bin/asu-tsv",params={"-source":cat,"-c":f"{RA} {DEC}","-c.rs":str(rad),"-out.max":"20"},timeout=40).text
            rows=[l for l in t.splitlines() if l and not l.startswith("#")]
            print(host,cat,rows[:6] if len(rows)>3 else "no rows"); out[f"{host} {cat}"]=rows[:10]
        except Exception as e: print(host,cat,"ERR",type(e).__name__); out[f"{host} {cat}"]=f"ERR {type(e).__name__}"
    if any(isinstance(v,list) for k,v in out.items() if k.startswith(host)): break
for url in ["https://simbad.cfa.harvard.edu/simbad/sim-coo","https://simbad.u-strasbg.fr/simbad/sim-coo"]:
    try:
        t=requests.get(url,params={"Coord":f"{RA} {DEC}","Radius":"20","Radius.unit":"arcsec","output.format":"ASCII"},timeout=40).text; print(url,t[:1500]); out["simbad "+url]=t[:3000]; break
    except Exception as e: print(url,"ERR",type(e).__name__); out["simbad "+url]=f"ERR {type(e).__name__}"
json.dump(out,open("data/step7_catalogs.json","w"),indent=1,default=str)
