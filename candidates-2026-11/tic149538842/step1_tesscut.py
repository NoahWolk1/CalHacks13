import warnings; warnings.filterwarnings("ignore")
import lightkurve as lk
for s in [65,97]:
    tpf=lk.search_tesscut("TIC 149538842", sector=s).download(cutout_size=25, download_dir="data/tesscut")
    print(s, tpf.shape, tpf.path, "origin", tpf.column, tpf.row, "cam/ccd", tpf.camera, tpf.ccd)
    print("WCS target pixel:", tpf.wcs.world_to_pixel_values(86.01301493,-60.84789692))
