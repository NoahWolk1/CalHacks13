import warnings, sys; warnings.filterwarnings("ignore")
import lightkurve as lk
from common import TIC
for s in map(int, sys.argv[1:]):
    try:
        tpf=lk.search_tesscut(f"TIC {TIC}", sector=s).download(cutout_size=21, download_dir="data/tesscut")
        print(s, tpf.shape, tpf.path, "cam/ccd", tpf.camera, tpf.ccd, flush=True)
    except Exception as e: print(s,"ERR",e, flush=True)
