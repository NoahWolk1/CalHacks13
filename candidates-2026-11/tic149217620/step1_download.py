import warnings; warnings.filterwarnings("ignore")
import lightkurve as lk, os, sys
from cfg import *
os.makedirs("data/lc", exist_ok=True)
sr = lk.search_lightcurve(f"TIC {TIC}")
AUTH=("QLP","GSFC-ELEANOR-LITE","TASOC","T16","TGLC")
extra=set(int(x) for x in sys.argv[1:])  # sectors for which to take all HLSPs
keep=[]
for i,(a,m) in enumerate(zip(sr.table["author"],sr.table["mission"])):
    s=int(m.split()[-1])
    if a=="QLP" or (a in AUTH and s in extra): keep.append(i)
sr=sr[keep]
for i in range(len(sr)):
    try: sr[i].download(download_dir="data/lc", flux_column="sap_flux" if sr.table["author"][i]=="QLP" else None)
    except Exception as e: print("ERR", sr.table["author"][i], sr.table["mission"][i], e)
print("done", len(sr))
