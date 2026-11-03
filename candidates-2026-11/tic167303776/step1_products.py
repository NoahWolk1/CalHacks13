import warnings; warnings.filterwarnings("ignore")
import lightkurve as lk
sr = lk.search_lightcurve("TIC 167303776")
print(sr.table["mission","author","exptime","target_name","year"].pformat(max_lines=-1))
tc = lk.search_tesscut("TIC 167303776"); print(list(tc.table["mission"]))
