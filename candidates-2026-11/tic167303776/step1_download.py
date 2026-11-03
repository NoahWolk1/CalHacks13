"""Download all SPOC 2-min, TESS-SPOC and QLP light curves; TGLC/TASOC/ELEANOR-lite/T16/TARS only for the event sector (S5)."""
import warnings; warnings.filterwarnings("ignore")
import lightkurve as lk, os
os.makedirs("data/lc", exist_ok=True)
sr = lk.search_lightcurve("TIC 167303776"); tab=sr.table
keep=[i for i in range(len(sr)) if tab["author"][i] in ("SPOC","TESS-SPOC","QLP") or (tab["sequence_number"][i]==5)]
sr=sr[keep]
for i in range(len(sr)):
    try: sr[i].download(download_dir="data/lc")
    except Exception as e: print("ERR", sr.table["author"][i], sr.table["mission"][i], e)
print("done", len(sr))
