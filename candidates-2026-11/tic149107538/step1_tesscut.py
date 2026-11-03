import warnings; warnings.filterwarnings("ignore")
import lightkurve as lk
tpf=lk.search_tesscut("TIC 149107538", sector=67).download(cutout_size=15, download_dir="data/tesscut")
print(tpf.shape, tpf.path, tpf.column, tpf.row, tpf.camera, tpf.ccd)
