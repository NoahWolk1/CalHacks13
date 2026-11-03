import warnings; warnings.filterwarnings("ignore")
import lightkurve as lk, numpy as np, sys
from cfg import *
for s in [int(x) for x in sys.argv[1:]]:
    tpf=lk.search_tesscut(f"{RA} {DEC}", sector=s).download(cutout_size=21, download_dir="data/tesscut")
    print(s, tpf.shape, tpf.path, "col,row origin", tpf.column, tpf.row, "cam/ccd", tpf.camera, tpf.ccd)
    f=np.nanmedian(tpf.flux.value,axis=0)
    print(" zero/NaN columns:", np.where(~(np.nanmax(f,0)>10))[0], "rows:", np.where(~(np.nanmax(f,1)>10))[0])
    print(" target pixel:", tpf.wcs.world_to_pixel_values(RA,DEC))
