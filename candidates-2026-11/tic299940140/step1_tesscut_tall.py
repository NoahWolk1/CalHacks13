import warnings; warnings.filterwarnings("ignore")
import lightkurve as lk
tpf=lk.search_tesscut("TIC 299940140", sector=4).download(cutout_size=(151,11), download_dir="data/tesscut_tall"); print(tpf.shape, tpf.path)
