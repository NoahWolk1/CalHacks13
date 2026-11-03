import requests, json
RA,DEC=105.20127450,-71.20768920; out={}
for host in ["vizier.cds.unistra.fr","vizier.iucaa.in","vizier.nao.ac.jp"]:
    for cat,rad in [("B/vsx/vsx",120),("J/ApJS/258/16",120),("B/wds/wds",30)]:
        try:
            t=requests.get(f"https://{host}/viz-bin/asu-tsv",params={"-source":cat,"-c":f"{RA} {DEC}","-c.rs":str(rad),"-out.max":"20"},timeout=40)
            rows=[l for l in t.text.splitlines() if l and not l.startswith("#")]
            ok=t.status_code==200 and "html" not in t.text[:200].lower()
            print(host,cat,t.status_code,(rows[:8] if len(rows)>3 else "no rows") if ok else "bad response"); out[f"{host} {cat}"]=rows[:10] if ok else f"HTTP {t.status_code}"
        except Exception as e: print(host,cat,"ERR",type(e).__name__); out[f"{host} {cat}"]=f"ERR {type(e).__name__}"
json.dump(out,open("data/step7b_vizier.json","w"),indent=1)
