import warnings; warnings.filterwarnings("ignore")
import lightkurve as lk
sr=lk.search_lightcurve("TIC 167889402")
for r in sr.table: print(r['mission'], r['author'], r['exptime'], r['target_name'])
tp=lk.search_targetpixelfile("TIC 167889402")
for r in tp.table: print("TPF", r['mission'], r['author'], r['exptime'])
tc=lk.search_tesscut("TIC 167889402"); print("TESSCUT", list(tc.table['mission']))
