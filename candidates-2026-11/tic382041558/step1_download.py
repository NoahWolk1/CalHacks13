import warnings; warnings.filterwarnings("ignore")
import lightkurve as lk, os
from common import TIC
os.makedirs("data/lc", exist_ok=True); os.makedirs("data/tesscut", exist_ok=True); os.makedirs("data/hlsp", exist_ok=True)
T=f"TIC {TIC}"
for author in ["TESS-SPOC","QLP"]:
    sr = lk.search_lightcurve(T, author=author)
    for i in range(len(sr)):
        try: sr[i].download(download_dir="data/lc", flux_column="sap_flux")
        except Exception as e: print("ERR",author,sr[i].mission,e)
    print(author, len(sr), flush=True)
for author in ["TARS","GSFC-ELEANOR-LITE","TGLC"]:
    sr = lk.search_lightcurve(T, author=author, sector=[36,37,38,39] if author=="TARS" else None)
    for i in range(len(sr)):
        try: sr[i].download(download_dir="data/hlsp")
        except Exception as e: print("ERR",author,sr[i].mission,str(e)[:100])
    print(author, len(sr), flush=True)
for s in [38,39]:
    sr=lk.search_tesscut(T, sector=s)
    for i in range(len(sr)): sr[i].download(cutout_size=21, download_dir="data/tesscut")
print("tesscut done")
