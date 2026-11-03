import warnings; warnings.filterwarnings("ignore")
import lightkurve as lk
for author in ["TESS-SPOC","QLP"]:
    sr = lk.search_lightcurve("TIC 177117017", author=author)
    sr.download_all(download_dir="data/lc")
    print(author, len(sr))
