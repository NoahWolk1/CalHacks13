import warnings; warnings.filterwarnings("ignore")
import lightkurve as lk
for s in [4,37,67,90]:
    tpf=lk.search_tesscut("TIC 167309586", sector=s).download(cutout_size=25, download_dir="data/tesscut")
    print(s, tpf.shape, tpf.path, tpf.camera, tpf.ccd, flush=True)
