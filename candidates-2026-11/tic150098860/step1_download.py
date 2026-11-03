import warnings; warnings.filterwarnings("ignore")
import lightkurve as lk, os
os.makedirs("data/lc", exist_ok=True)
for author,exp in [("SPOC",120),("TESS-SPOC",None),("QLP",None)]:
    sr = lk.search_lightcurve("TIC 150098860", author=author, exptime=exp) if exp else lk.search_lightcurve("TIC 150098860", author=author)
    print(author, len(sr), sorted(set(sr.table['mission'])))
    for i in range(len(sr)):
        try: sr[i].download(download_dir="data/lc", flux_column="sap_flux")
        except Exception as e: print("ERR",author,sr[i].mission,e)
