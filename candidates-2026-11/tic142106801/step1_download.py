import warnings; warnings.filterwarnings("ignore")
import lightkurve as lk, os, sys
os.makedirs("data/lc", exist_ok=True); os.makedirs("data/tesscut", exist_ok=True)
T="TIC 142106801"
what=sys.argv[1] if len(sys.argv)>1 else "lc"
if what=="lc":
    for author in ["QLP","GSFC-ELEANOR-LITE","TGLC","T16","TASOC"]:
        sr=lk.search_lightcurve(T, author=author)
        if author!="QLP": sr=sr[[int(m.split()[-1]) in (5,6,7,8) for m in sr.table['mission']]]
        for i in range(len(sr)):
            try: sr[i].download(download_dir="data/lc")
            except Exception as e: print("ERR",author,sr[i].mission,e)
        print(author, len(sr), flush=True)
else:
    for s in [int(x) for x in what.split(",")]:
        sr=lk.search_tesscut(T, sector=s)
        for i in range(len(sr)): sr[i].download(cutout_size=21, download_dir="data/tesscut")
        print("tesscut",s,flush=True)
