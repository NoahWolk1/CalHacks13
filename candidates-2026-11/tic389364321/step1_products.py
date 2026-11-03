import warnings; warnings.filterwarnings("ignore")
import lightkurve as lk
sr=lk.search_lightcurve("TIC 389364321")
print(sr.table['mission','author','exptime','target_name','distance'].pformat(max_lines=200))
print(lk.search_tesscut("TIC 389364321").table['mission'].pformat(max_lines=100))
