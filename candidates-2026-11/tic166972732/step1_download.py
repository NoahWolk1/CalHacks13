"""All QLP light curves, plus every year-1 HLSP (ELEANOR-lite, T16/CDIPS-like, TASOC, TGLC, TARS) for an independent reduction."""
import warnings; warnings.filterwarnings("ignore")
import lightkurve as lk, os
from common import TIC
os.makedirs("data/lc", exist_ok=True)
sr_all = lk.search_lightcurve(f"TIC {TIC}")
for author in ["QLP","GSFC-ELEANOR-LITE","T16","TASOC","TGLC","TARS"]:
    sr = sr_all[sr_all.author==author]
    n=0
    for i in range(len(sr)):
        yr1 = int(str(sr.table["mission"][i]).split()[-1]) <= 13
        if author!="QLP" and not yr1: continue
        try: sr[i].download(download_dir="data/lc"); n+=1
        except Exception as e: print("ERR",author,sr.table["mission"][i],str(e)[:120])
    print(author, n, flush=True)
