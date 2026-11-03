"""Same-time dips on other stars: TESS-SPOC S67 FFI light curves of up to 15 other targets within 1 deg
(camera 4 CCD 4); 8 h box depth (SAP, PDCSAP) at the event epoch on the measure.py baseline."""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, json, os
import lightkurve as lk
from astropy.io import fits
from measure import measure
from common import RA, DEC, TC, DUR
os.makedirs("data/nbr",exist_ok=True)
from astroquery.mast import Catalogs
from astropy.coordinates import SkyCoord; import astropy.units as u
cat=Catalogs.query_region(SkyCoord(RA,DEC,unit="deg"),radius=0.5*u.deg,catalog="TIC")
cat=cat[(cat["Tmag"]<11.5)&(cat["Tmag"]>8)&(cat["ID"]!="149107538")]; cat.sort("dstArcSec")
out=[]; nd=0
for n,dist in zip(cat["ID"],cat["dstArcSec"]):
    if nd>=15: break
    try:
        sr=lk.search_lightcurve(f"TIC {n}",author="TESS-SPOC",sector=67)
        if len(sr)==0: continue
        i=0; lc=sr[0].download(download_dir="data/nbr",flux_column="sap_flux"); nd+=1
    except Exception as e: print(n,"ERR",e); continue
    h=fits.open(lc.meta['FILENAME']); d=h[1].data; t=d['TIME']; q=d['QUALITY']
    rec=dict(tic=n,ccd=h[0].header['CCD'],tmag=h[0].header.get('TESSMAG'),sep_deg=round(float(dist)/3600,2))
    for col in ['SAP_FLUX','PDCSAP_FLUX']:
        f=d[col]; g=(q==0)&np.isfinite(f)
        m=measure(t[g],f[g],TC,DUR,win=1.0)
        if m is None or not np.isfinite(m.get('depth',np.nan)): continue
        rec[col]=dict(depth_ppt=round(m['depth']*1e3,3),sig=round(m['sig_adopt']*1e3,3),frac_deeper=round(float(m['frac_deeper']),3))
    out.append(rec); print(rec,flush=True)
json.dump(out,open("data/step3_neighbors.json","w"),indent=1)
