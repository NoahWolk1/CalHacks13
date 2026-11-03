"""Download all TESS-SPOC + QLP light curves, and TARS for S32 (event sector)."""
import warnings; warnings.filterwarnings("ignore")
import lightkurve as lk, os
from common import *
os.makedirs("data/lc", exist_ok=True)
sr = lk.search_lightcurve(f"TIC {TIC}"); tab=sr.table
keep=[i for i in range(len(sr)) if tab["author"][i] in ("TESS-SPOC","QLP") or (tab["author"][i]=="TARS" and tab["sequence_number"][i]==32)]
sr=sr[keep]
for i in range(len(sr)):
    try: sr[i].download(download_dir="data/lc")
    except Exception as e: print("ERR", sr.table["author"][i], sr.table["mission"][i], e)
print("done", len(sr))
