"""Retry of the TOI and CTOI list downloads (one failed in step7_catalogs.py)."""
import requests, json
from common import TIC
out={}
for name,url in [("toi","https://exofop.ipac.caltech.edu/tess/download_toi.php?sort=toi&output=csv"),("ctoi","https://exofop.ipac.caltech.edu/tess/download_ctoi.php?sort=ctoi&output=csv")]:
    for k in range(3):
        try:
            lines=requests.get(url,timeout=180).text.splitlines(); hit=[l for l in lines if TIC in l.split(",")[:3]]
            out[name]=dict(n_lines=len(lines),hits=hit); print(name,len(lines),"lines; hits:",hit[:3]); break
        except Exception as e: print(name,"ERR",e)
json.dump(out,open("data/step7_catalogs2.json","w"),indent=1)
