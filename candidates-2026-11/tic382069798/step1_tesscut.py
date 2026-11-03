import warnings; warnings.filterwarnings("ignore")
import lightkurve as lk
from common import *
for s in [32,31,33]:
    tpf=lk.search_tesscut(f"TIC {TIC}", sector=s).download(cutout_size=21, download_dir="data/tesscut")
    print(s, tpf.shape, tpf.path, "cam/ccd", tpf.camera, tpf.ccd, "WCS target px", tpf.wcs.world_to_pixel_values(RA,DEC))
