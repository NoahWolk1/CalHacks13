import warnings; warnings.filterwarnings("ignore")
import lightkurve as lk, os
os.makedirs("data/lc", exist_ok=True)
sr = lk.search_lightcurve("TIC 142084274")
keep=[i for i,a in enumerate(sr.table["author"]) if a in ("SPOC","TESS-SPOC","QLP","GSFC-ELEANOR-LITE")]
sr=sr[keep]
for i in range(len(sr)):
    try:
        sr[i].download(download_dir="data/lc", flux_column="sap_flux" if sr.table["author"][i] in ("SPOC","TESS-SPOC") else None)
    except Exception as e: print("ERR", sr.table["author"][i], sr.table["mission"][i], e)
print("done", len(sr))
