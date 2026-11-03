import warnings; warnings.filterwarnings("ignore")
import lightkurve as lk, os
from common import TIC
os.makedirs("data/lc", exist_ok=True)
for author in ["QLP","GSFC-ELEANOR-LITE","TASOC"]:
    sr = lk.search_lightcurve(f"TIC {TIC}", author=author)
    for i in range(len(sr)):
        try: sr[i].download(download_dir="data/lc", flux_column="sap_flux" if author!="TASOC" else "flux_raw")
        except Exception as e: print("ERR",author,sr[i].mission,e)
    print(author, len(sr), flush=True)
