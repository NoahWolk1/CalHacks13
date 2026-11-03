import warnings; warnings.filterwarnings("ignore")
import lightkurve as lk
for s in [3]:
    tpf=lk.search_tesscut("TIC 177117017", sector=s).download(cutout_size=25, download_dir="data/tesscut")
    print(s, tpf.shape, tpf.path, tpf.camera, tpf.ccd)
