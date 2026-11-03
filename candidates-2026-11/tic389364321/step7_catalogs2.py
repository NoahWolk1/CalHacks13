import requests
RA,DEC=85.54816340640646,-69.02758470891541
def get(u,**kw):
    try: r=requests.get(u,timeout=40,**kw); return f"[{r.status_code}] "+r.text
    except Exception as e: return f"ERR {type(e).__name__}"
for host in ["vizier.cfa.harvard.edu","vizier.cds.unistra.fr","tapvizier.cds.unistra.fr"]:
    for cat in ["B/vsx/vsx","J/AcA/66/421","J/AcA/61/103","I/358/vclassre","J/ApJS/258/16"]:
        t=get(f"https://{host}/viz-bin/asu-tsv",params={"-source":cat,"-c":f"{RA} {DEC}","-c.rs":"30"})
        rows=[l for l in t.splitlines() if l and not l.startswith("#")]
        print(host,cat,t[:6] if t.startswith(("ERR","[5","[4")) else (rows[3:8] if len(rows)>3 else "no rows"),flush=True)
# OGLE collection of variable stars: LMC 
for u in ["https://ogledb.astrouw.edu.pl/~ogle/OCVS/","http://ogle.astrouw.edu.pl/"]:
    print(u, get(u)[:120].replace("\n"," "))
