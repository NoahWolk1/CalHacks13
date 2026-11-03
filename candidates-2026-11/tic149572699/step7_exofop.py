import requests, json
from common import TIC
j=requests.get(f"https://exofop.ipac.caltech.edu/tess/target.php?id={TIC}&json",timeout=60).text
open("data/exofop.json","w").write(j)
d=json.loads(j)
for k in d: print(k, json.dumps(d[k])[:300])
for u in ["https://exofop.ipac.caltech.edu/tess/download_toi.php?sort=toi&output=pipe","https://exofop.ipac.caltech.edu/tess/download_ctoi.php?sort=ctoi&output=pipe"]:
    t=requests.get(u,timeout=90).text; print(u.split("/")[-1][:16],"lines",len(t.splitlines()),"hits",[l[:200] for l in t.splitlines() if TIC in l])
