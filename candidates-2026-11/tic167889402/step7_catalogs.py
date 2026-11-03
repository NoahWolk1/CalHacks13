"""ExoFOP target JSON, TOI and CTOI lists, SIMBAD (CfA TAP), VizieR (CfA asu-tsv): VSX, HGCA, Kervella PMa, WDS, Hipparcos, TESS EBs."""
import warnings; warnings.filterwarnings("ignore")
import json, requests, sys
from common import RA, DEC, TIC
out={}; T=40
def p(*a): print(*a, flush=True)
try:
    j=requests.get(f"https://exofop.ipac.caltech.edu/tess/target.php?id={TIC}&json",timeout=T).json(); json.dump(j,open("data/exofop.json","w"),indent=1)
    for k in ["tois","ctois","imaging","spectroscopy","time_series","planet_parameters","tags","stellar_companions","notes","confirmed_planets"]:
        if k in j: p("ExoFOP",k,":",json.dumps(j[k])[:400]); out["exofop_"+k]=j[k]
    p("basic:",json.dumps(j.get("basic_info",{}))[:600])
except Exception as e: p("ExoFOP ERR",e)
for name,url in [("toi","https://exofop.ipac.caltech.edu/tess/download_toi.php?sort=toi&output=pipe"),("ctoi","https://exofop.ipac.caltech.edu/tess/download_ctoi.php?sort=ctoi&output=pipe")]:
    try:
        txt=requests.get(url,timeout=120).text; hits=[l for l in txt.splitlines() if f"|{TIC}|" in l or l.startswith(f"{TIC}|")]
        p(name,"lines",len(txt.splitlines()),"hits",hits); out[name]=hits
    except Exception as e: p(name,"ERR",e)
q=f"SELECT main_id, otype, sp_type, rvz_radvel, rvz_type, plx_value FROM basic WHERE CONTAINS(POINT('ICRS',ra,dec),CIRCLE('ICRS',{RA},{DEC},0.01))=1"
for host in ["simbad.cfa.harvard.edu","simbad.cds.unistra.fr"]:
    try:
        r=requests.get(f"https://{host}/simbad/sim-tap/sync",params=dict(request="doQuery",lang="adql",format="text",query=q),timeout=T); p("SIMBAD",host,r.text[:1500]); out["simbad"]=r.text
        r2=requests.get(f"https://{host}/simbad/sim-tap/sync",params=dict(request="doQuery",lang="adql",format="text",query="SELECT id FROM ident JOIN basic ON oidref=oid WHERE main_id='HD  51199' OR main_id LIKE '%33733%'"),timeout=T); p(r2.text[:800])
        break
    except Exception as e: p("SIMBAD",host,"ERR",e)
for cat,rad in [("B/vsx/vsx",120),("J/A+A/657/A7/tablea1",5),("J/ApJS/254/42/hgca",5),("I/311/hip2",5),("B/wds/wds",30),("J/ApJS/258/16",60),("B/gcvs/gcvs_cat",60),("B/sb9/main",10),("J/A+A/623/A72/hipgaia",5)]:
    for host in ["vizier.cfa.harvard.edu","vizier.cds.unistra.fr"]:
        try:
            r=requests.get(f"https://{host}/viz-bin/asu-tsv",params={"-source":cat,"-c":f"{RA} {DEC}","-c.rs":rad,"-out.max":20,"-out.all":""},timeout=T)
            rows=[l for l in r.text.splitlines() if l and not l.startswith("#")]
            p(f"VizieR {host} {cat}: {len(rows)} lines"); [p("   ",l[:400]) for l in rows[:6]]; out[cat]=rows; break
        except Exception as e: p("VizieR",host,cat,"ERR",e)
json.dump(out,open("data/step7_catalogs.json","w"),indent=1,default=str)
