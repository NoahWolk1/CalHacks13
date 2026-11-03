import warnings; warnings.filterwarnings("ignore")
import lightkurve as lk, os
os.makedirs("data/lc", exist_ok=True)
for author,exp in [("SPOC",120),("TESS-SPOC",None),("QLP",None)]:
    sr = lk.search_lightcurve("TIC 167309586", author=author, exptime=exp) if exp else lk.search_lightcurve("TIC 167309586", author=author)
    for i in range(len(sr)):
        try: sr[i].download(download_dir="data/lc", flux_column="sap_flux")
        except Exception as e: print("ERR",author,sr[i].mission,e)
    print(author, len(sr))
