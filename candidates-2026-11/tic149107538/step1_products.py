import warnings; warnings.filterwarnings("ignore")
import lightkurve as lk
sr = lk.search_lightcurve("TIC 149107538")
print(sr.table["mission","author","exptime","target_name","year","distance"].pformat(max_lines=-1))
tc = lk.search_tesscut("TIC 149107538")
print(tc.table["mission"].pformat(max_lines=-1))
