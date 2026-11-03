"""Gaia DR3 EBs within 2': predicted phase of the S3 event, and the eclipse depth each would need (aperture share
from the S3 PSF model is approximated by its flux ratio to HD 269859 times HD 269859's share and a Gaussian PSF falloff)."""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, json
from astroquery.gaia import Gaia
from astropy.table import Table
from common import TC
gaia=Table.read("data/gaia_2arcmin.csv")
x=Gaia.launch_job_async("SELECT source_id,frequency,reference_time,derived_primary_ecl_phase,derived_primary_ecl_depth,derived_secondary_ecl_phase,derived_secondary_ecl_depth FROM gaiadr3.vari_eclipsing_binary WHERE source_id IN (4657655435670389120,4657656084225020160,4657656878802935040,4657656878802969472,4657656874485710336,4657655160816101760,4657654920297840000)").get_results()
out=[]
for r in x:
    P=1/r['frequency']; t0=r['reference_time']+2455197.5-2457000  # Gaia time = BJD-2455197.5
    ph=((TC-t0)/P - r['derived_primary_ecl_phase'])%1
    phs=((TC-t0)/P - (r['derived_secondary_ecl_phase'] if np.isfinite(r['derived_secondary_ecl_phase']) else 9))%1
    row=gaia[gaia['source_id']==r['source_id']][0]
    sep_px=row['sep']/21.
    share=10**(-0.4*(row['phot_g_mean_mag']-10.83))*0.371*np.exp(-sep_px**2/(2*0.64**2))/1.0
    need=1.71e-3/max(share,1e-12)
    out.append(dict(source_id=int(r['source_id']),sep=round(float(row['sep']),1),G=round(float(row['phot_g_mean_mag']),2),P=round(float(P),4),
        phase_from_primary=round(float(min(ph,1-ph)),3),phase_from_secondary=round(float(min(phs,1-phs)),3) if phs<9 else None,
        approx_aperture_share=float(f"{share:.2e}"),depth_needed=round(float(need),1),gaia_depths_mag=[float(r['derived_primary_ecl_depth']),float(r['derived_secondary_ecl_depth']) if np.isfinite(r['derived_secondary_ecl_depth']) else None]))
for o in sorted(out,key=lambda o:o['sep']): print(o)
json.dump(out,open("data/step3_gaia_ebs.json","w"),indent=1)
