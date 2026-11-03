import warnings; warnings.filterwarnings("ignore")
import lightkurve as lk, os
from common import TIC
os.makedirs("data/lc", exist_ok=True); os.makedirs("data/tpf", exist_ok=True); os.makedirs("data/tesscut", exist_ok=True)
T=f"TIC {TIC}"
for author,exp in [("SPOC",120),("QLP",None),("TESS-SPOC",None)]:
    sr = lk.search_lightcurve(T, author=author, exptime=exp) if exp else lk.search_lightcurve(T, author=author)
    for i in range(len(sr)):
        try: sr[i].download(download_dir="data/lc", flux_column="sap_flux")
        except Exception as e: print("ERR",author,sr[i].mission,e)
    print(author, len(sr), flush=True)
sr=lk.search_targetpixelfile(T, author="SPOC", exptime=120, sector=[2,3,97])
for i in range(len(sr)): sr[i].download(download_dir="data/tpf")
print("tpf", len(sr), flush=True)
for s in [3,97]:
    sr=lk.search_tesscut(T, sector=s)
    for i in range(len(sr)): sr[i].download(cutout_size=25, download_dir="data/tesscut")
print("tesscut done")
