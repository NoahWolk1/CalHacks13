import warnings; warnings.filterwarnings("ignore")
import lightkurve as lk
from common import TIC
sr=lk.search_lightcurve(f"TIC {TIC}")
print(sr.table['mission','author','exptime','target_name','distance'].pformat(max_lines=200))
print(lk.search_tesscut(f"TIC {TIC}").table['mission'].pformat(max_lines=100))
sr=lk.search_targetpixelfile(f"TIC {TIC}"); print(sr)
