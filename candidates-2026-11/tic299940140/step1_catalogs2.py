import requests
RA,DEC=106.180320908444,-68.5710119785883
for host in ["vizier.cfa.harvard.edu","vizier.iucaa.in"]:
    for cat in ["B/vsx/vsx","J/ApJS/258/16"]:
        try:
            t=requests.get(f"https://{host}/viz-bin/asu-tsv",params={"-source":cat,"-c":f"{RA} {DEC}","-c.rs":"120"},timeout=40).text
            print(host,cat,[l for l in t.splitlines() if l and not l.startswith("#")][:6] or "no rows")
        except Exception as e: print(host,cat,"ERR",type(e).__name__)
try:
    t=requests.get("https://www.aavso.org/vsx/index.php",params={"view":"api.list","ra":RA,"dec":DEC,"radius":0.05,"format":"json"},timeout=40).text; print("AAVSO VSX api:",t[:500])
except Exception as e: print("AAVSO ERR",e)
for url in ["https://simbad.cfa.harvard.edu/simbad/sim-coo","https://simbad.u-strasbg.fr/simbad/sim-coo"]:
    try:
        t=requests.get(url,params={"Coord":f"{RA} {DEC}","Radius":"30","Radius.unit":"arcsec","output.format":"ASCII"},timeout=40).text; print(url,t[:900])
    except Exception as e: print(url,"ERR",type(e).__name__)
