"""QLP (S27-98), TGLC + ELEANOR-lite (year 1, for the repeat search), TESScut 25x25 for S30 (event) and S89 (the vet's 'secondary' at 3736.06)."""
import warnings; warnings.filterwarnings("ignore")
import lightkurve as lk, os
from common import TIC
os.makedirs("data/lc", exist_ok=True); os.makedirs("data/tesscut", exist_ok=True)
T=f"TIC {TIC}"
for author in ["QLP","TGLC","GSFC-ELEANOR-LITE"]:
    sr=lk.search_lightcurve(T, author=author)
    for i in range(len(sr)):
        try: sr[i].download(download_dir="data/lc", flux_column="sap_flux")
        except Exception as e: print("ERR",author,sr[i].mission,e)
    print(author, len(sr), flush=True)
for s in [30,89]:
    sr=lk.search_tesscut(T, sector=s)
    for i in range(len(sr)): sr[i].download(cutout_size=25, download_dir="data/tesscut")
print("tesscut done")
