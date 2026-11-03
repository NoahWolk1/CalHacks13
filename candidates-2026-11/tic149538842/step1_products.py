import warnings; warnings.filterwarnings("ignore")
import lightkurve as lk
sr = lk.search_lightcurve("TIC 149538842")
print(sr.table["mission","author","exptime","target_name","year","distance"].pformat(max_lines=-1))
tc = lk.search_tesscut("TIC 149538842")
print(tc.table["mission"].pformat(max_lines=-1))
sr2 = lk.search_targetpixelfile("TIC 149538842"); print(sr2)
