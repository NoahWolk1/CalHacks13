import warnings; warnings.filterwarnings("ignore")
import lightkurve as lk
sr=lk.search_lightcurve("TIC 382041558")
print(sr.table['mission','author','exptime','target_name','distance'].pformat(max_lines=200))
print(lk.search_tesscut("TIC 382041558").table['mission'].pformat(max_lines=100))
