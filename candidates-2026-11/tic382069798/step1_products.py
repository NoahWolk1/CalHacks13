import warnings; warnings.filterwarnings("ignore")
import lightkurve as lk
from common import *
sr = lk.search_lightcurve(f"TIC {TIC}")
print(sr.table["mission","author","exptime","target_name","distance"].pformat(max_lines=-1))
tc = lk.search_tesscut(f"TIC {TIC}"); print(tc.table["mission"].pformat(max_lines=-1))
