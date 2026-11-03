import warnings; warnings.filterwarnings("ignore")
import lightkurve as lk, os, sys
os.makedirs("data/tpf", exist_ok=True)
for s in map(int, sys.argv[1:]):
    sr=lk.search_targetpixelfile("TIC 167889402", author="SPOC", exptime=120, sector=s)
    print(s, len(sr)); t=sr[0].download(download_dir="data/tpf"); print(t.path, t.shape)
