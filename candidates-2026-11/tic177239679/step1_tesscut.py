import warnings; warnings.filterwarnings("ignore")
import lightkurve as lk, numpy as np, sys
for s in [65,95]:
    tpf=lk.search_tesscut("TIC 177239679", sector=s).download(cutout_size=21, download_dir="data/tesscut")
    print(s, tpf.shape, tpf.path, "col,row origin", tpf.column, tpf.row, "cam/ccd", tpf.camera, tpf.ccd)
    print("WCS target pixel:", tpf.wcs.world_to_pixel_values(105.20127,-71.20769))
