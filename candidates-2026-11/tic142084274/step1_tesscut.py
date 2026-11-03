import warnings; warnings.filterwarnings("ignore")
import lightkurve as lk, numpy as np
tpf=lk.search_tesscut("TIC 142084274", sector=12).download(cutout_size=21, download_dir="data/tesscut")
print(tpf.shape, tpf.path, "col,row origin", tpf.column, tpf.row, "cam/ccd", tpf.camera, tpf.ccd)
f=np.nanmedian(tpf.flux.value,axis=0)
np.set_printoptions(linewidth=250, precision=0, suppress=True)
print(f)
print("WCS target pixel:", tpf.wcs.world_to_pixel_values(98.12203,-74.85380))
