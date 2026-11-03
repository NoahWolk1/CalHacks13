"""Same-time dips on other stars: SPOC 2-min S31 light curves of up to 15 other targets within 1 deg (camera 4 CCD 3),
8 h box depth (SAP and PDCSAP) at the event epoch and its rank within each star's own sector."""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, json, os
import lightkurve as lk
from astropy.io import fits
from measure import measure
from common import RA, DEC, TC, DUR
os.makedirs("data/nbr",exist_ok=True)
sr=lk.search_lightcurve(f"{RA} {DEC}",radius=3600,author="SPOC",exptime=120,sector=31)
names=[n for n in dict.fromkeys(sr.table['target_name']) if n!='389364321'][:15]
out=[]
for n in names:
    i=[k for k in range(len(sr)) if sr.table['target_name'][k]==n][0]
    try: lc=sr[i].download(download_dir="data/nbr",flux_column="sap_flux")
    except Exception as e: print(n,"ERR",e); continue
    h=fits.open(lc.meta['FILENAME']); d=h[1].data; t=d['TIME']; q=d['QUALITY']
    rec=dict(tic=n,ccd=h[0].header['CCD'],tmag=h[0].header.get('TESSMAG'),sep_deg=round(float(sr.table['distance'][i])/3600,2))
    for col in ['SAP_FLUX','PDCSAP_FLUX']:
        f=d[col]; g=(q==0)&np.isfinite(f)
        m=measure(t[g],f[g],TC,DUR,win=1.0)
        if m is None or not np.isfinite(m.get('depth',np.nan)): continue
        rec[col]=dict(depth_ppt=round(m['depth']*1e3,3),sig=round(m['sig_adopt']*1e3,3),frac_deeper=round(float(m['frac_deeper']),3))
    out.append(rec); print(rec,flush=True)
json.dump(out,open("data/step3_neighbors.json","w"),indent=1)
