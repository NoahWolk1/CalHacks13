"""Download all QLP light curves (small files)."""
import warnings; warnings.filterwarnings("ignore")
import lightkurve as lk, os
os.makedirs("data/lc", exist_ok=True)
sr = lk.search_lightcurve("TIC 149538842", author="QLP")
for i in range(len(sr)):
    try: sr[i].download(download_dir="data/lc")
    except Exception as e: print("ERR", sr.table["mission"][i], e)
print("done", len(sr))
