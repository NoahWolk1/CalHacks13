"""Download all TESS-SPOC + QLP light curves (small files), and TARS/ELEANOR/TGLC only for event sectors."""
import warnings; warnings.filterwarnings("ignore")
import lightkurve as lk, os
os.makedirs("data/lc", exist_ok=True)
sr = lk.search_lightcurve("TIC 177239679")
tab=sr.table
keep=[i for i in range(len(sr)) if tab["author"][i] in ("TESS-SPOC","QLP") or (tab["author"][i] in ("TARS",) and tab["sequence_number"][i] in (64,65,66,94,95,96))]
sr=sr[keep]
for i in range(len(sr)):
    try: sr[i].download(download_dir="data/lc")
    except Exception as e: print("ERR", sr.table["author"][i], sr.table["mission"][i], e)
print("done", len(sr))
