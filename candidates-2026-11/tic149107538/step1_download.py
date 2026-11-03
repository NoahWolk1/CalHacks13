import warnings; warnings.filterwarnings("ignore")
import lightkurve as lk, os
os.makedirs("data/lc", exist_ok=True)
sr = lk.search_lightcurve("TIC 149107538")
tab=sr.table
keep=[i for i in range(len(sr)) if tab["author"][i] in ("TESS-SPOC","QLP","SPOC") or (tab["author"][i]=="TARS" and tab["sequence_number"][i] in (66,67,68,69))]
sr=sr[keep]
for i in range(len(sr)):
    try: sr[i].download(download_dir="data/lc")
    except Exception as e: print("ERR", sr.table["author"][i], sr.table["mission"][i], e)
print("done", len(sr))
