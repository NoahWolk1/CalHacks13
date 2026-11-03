import warnings; warnings.filterwarnings("ignore")
import lightkurve as lk, os
os.makedirs("data/tesscut", exist_ok=True)
for s in [4,98]:
    sr=lk.search_tesscut("TIC 150098860", sector=s)
    print(s, len(sr))
    for i in range(len(sr)):
        tpf=sr[i].download(cutout_size=25, download_dir="data/tesscut"); print(tpf.path if hasattr(tpf,'path') else tpf)
