import warnings; warnings.filterwarnings("ignore")
import lightkurve as lk, numpy as np
for a in ["GSFC-ELEANOR-LITE","TASOC","TARS"]:
    sr=lk.search_lightcurve("TIC 177117017", author=a, sector=3)
    print(a, len(sr))
    for i in range(len(sr)):
        try:
            lc=sr[i].download(download_dir="data/lc_other")
            print(a, i, lc.meta.get("FILENAME") if hasattr(lc,'meta') else '', lc.time.value.min(), lc.time.value.max(), lc.flux.unit, list(lc.columns)[:20])
        except Exception as e: print("ERR",a,i,e)
