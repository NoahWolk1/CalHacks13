"""QLP S3 light curves of other stars on the same camera/CCD: same-time features?"""
import warnings; warnings.filterwarnings("ignore")
import lightkurve as lk, numpy as np, json
sr=lk.search_lightcurve("TIC 177117017", radius=3600*1.5, author="QLP", sector=3)
print(len(sr))
tab=sr.table; tab.sort("distance")
import random
sel=[i for i in range(len(tab)) if str(tab["target_name"][i])!="177117017"]
picked=sel[:12]+sel[len(sel)//2:len(sel)//2+6]
for i in picked:
    try:
        lc=sr[int(np.where(sr.table["target_name"]==tab["target_name"][i])[0][0])].download(download_dir="data/lc_neighbor")
        print(tab["target_name"][i], round(float(tab["distance"][i])/3600,2),"deg")
    except Exception as e: print("ERR",e)
