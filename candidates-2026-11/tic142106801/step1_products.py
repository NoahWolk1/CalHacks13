import warnings; warnings.filterwarnings("ignore")
import lightkurve as lk
sr=lk.search_lightcurve("TIC 142106801")
print(sr.table['mission','author','exptime','target_name','distance'].pformat(max_lines=200))
print(lk.search_targetpixelfile("TIC 142106801").table['mission','author','exptime'].pformat(max_lines=100))
print(lk.search_tesscut("TIC 142106801").table['mission'].pformat(max_lines=100))
