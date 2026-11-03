import numpy as np
from lcio import load_all
for r in load_all():
    t=r['t']; print(r['author'], r['sector'], r['camera'], r['ccd'], f"{np.nanmin(t):.2f}-{np.nanmax(t):.2f}", r['hdr1'].get('CROWDSAP'), r['hdr1'].get('FLFRCSAP'))
