import warnings; warnings.filterwarnings("ignore")
import lightkurve as lk
for author in ["TESS-SPOC","QLP"]:
    sr = lk.search_lightcurve("TIC 299940140", author=author)
    sr.download_all(download_dir="data/lc", flux_column="sap_flux"); print(author, len(sr))
for author in ["GSFC-ELEANOR-LITE","TGLC","TASOC","T16","TARS"]:
    sr = lk.search_lightcurve("TIC 299940140", author=author, sector=[3,4,5])
    try: sr.download_all(download_dir="data/lc_hlsp"); print(author, len(sr))
    except Exception as e: print(author,"ERR",e)
for s in [3,4,5]:
    tpf=lk.search_tesscut("TIC 299940140", sector=s).download(cutout_size=21, download_dir="data/tesscut"); print(s,tpf.shape)
