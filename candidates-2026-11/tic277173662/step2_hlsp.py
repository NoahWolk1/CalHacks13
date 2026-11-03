"""S3 HLSPs (GSFC-ELEANOR-LITE, T16): depth at the event (measure.py, 6 h box) in every flux column."""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, json, lightkurve as lk
from astropy.io import fits
from measure import measure
from common import TIC, TC, DUR
out=[]
for au in ["GSFC-ELEANOR-LITE","T16"]:
    sr=lk.search_lightcurve(f"TIC {TIC}",author=au,sector=3)
    for i in range(len(sr)):
        try: lc=sr[i].download(download_dir="data/hlsp")
        except Exception as e: print(au,"ERR",str(e)[:100]); continue
        h=fits.open(lc.meta['FILENAME']); d=h[1].data; t=np.array(d['TIME'],float)
        q=np.array(d['QUALITY']) if 'QUALITY' in d.columns.names else np.zeros(len(t),int)
        for col in [c for c in d.columns.names if 'FLUX' in c.upper() and 'ERR' not in c.upper() and 'BKG' not in c.upper()]:
            f=np.array(d[col],float); g=(q==0)&np.isfinite(f)&np.isfinite(t)
            if g.sum()<50: continue
            m=measure(t[g],f[g],TC,DUR,win=1.0,min_cov=0.3)
            rec=dict(author=au,col=col,n=int(g.sum()))
            if m is not None and np.isfinite(m.get('depth',np.nan)): rec.update(depth_ppt=round(m['depth']*1e3,2),sig=round(m['sig_adopt']*1e3,2),cov=round(m['cov'],2))
            out.append(rec); print(rec)
json.dump(out,open("data/step2_hlsp.json","w"),indent=1)
