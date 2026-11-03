import warnings; warnings.filterwarnings("ignore")
import lightkurve as lk, sys
from common import TIC
for s in [int(x) for x in sys.argv[1:]] or [2,6]:
    tpf=lk.search_tesscut(f"TIC {TIC}", sector=s).download(cutout_size=21, download_dir="data/tesscut")
    print(s, tpf.shape, tpf.path, tpf.camera, tpf.ccd, flush=True)
