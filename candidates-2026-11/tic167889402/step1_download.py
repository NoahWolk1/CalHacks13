import warnings; warnings.filterwarnings("ignore")
import lightkurve as lk, os
os.makedirs("data/lc", exist_ok=True)
sr=lk.search_lightcurve("TIC 167889402", author="SPOC", exptime=120)
print("SPOC", len(sr))
sr.download_all(download_dir="data/lc", flux_column="sap_flux")
sr=lk.search_lightcurve("TIC 167889402", author="QLP")
sel=[i for i in range(len(sr)) if int(sr.table['mission'][i].split()[-1]) in (87,88,89,90,93,94,95,96,97,98)]
sr[sel].download_all(download_dir="data/lc", flux_column="sap_flux")
