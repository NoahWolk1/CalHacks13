import warnings; warnings.filterwarnings("ignore")
import lightkurve as lk, os, sys
from common import TIC
os.makedirs("data/lc", exist_ok=True)
authors = sys.argv[1:] or ["QLP","SPOC","TESS-SPOC"]
for author in authors:
    sr = lk.search_lightcurve(f"TIC {TIC}", author=author)
    for i in range(len(sr)):
        try: sr[i].download(download_dir="data/lc", flux_column="sap_flux")
        except Exception as e: print("ERR",author,sr[i].mission,e)
    print(author, len(sr), flush=True)
