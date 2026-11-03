import warnings; warnings.filterwarnings("ignore")
import json, numpy as np
from astroquery.gaia import Gaia
from astroquery.vizier import Vizier
from astroquery.simbad import Simbad
from astropy.coordinates import SkyCoord; import astropy.units as u
RA,DEC=103.92415503464,-67.340521552983
out={}
q=f"""SELECT source_id, ra, dec, pmra, pmdec, parallax, phot_g_mean_mag, bp_rp, ruwe, radial_velocity, radial_velocity_error, rv_nb_transits,
 rv_chisq_pvalue, rv_renormalised_gof, rv_amplitude_robust, rv_method_used, phot_variable_flag, non_single_star, has_epoch_photometry, ipd_frac_multi_peak, ipd_gof_harmonic_amplitude,
 DISTANCE(POINT({RA},{DEC}), POINT(ra,dec))*3600 AS sep
 FROM gaiadr3.gaia_source WHERE 1=CONTAINS(POINT(ra,dec), CIRCLE({RA},{DEC}, 0.0333333)) ORDER BY sep"""
t=Gaia.launch_job(q).get_results(); t.write("data/gaia_2arcmin.csv",overwrite=True)
print("N gaia within 2'",len(t))
tg=t[t["source_id"]==5281640722640603264][0]
out["gaia_target"]={c:(None if np.ma.is_masked(tg[c]) else (tg[c].item() if hasattr(tg[c],"item") else str(tg[c]))) for c in t.colnames}
gt=tg["phot_g_mean_mag"]
t["dG"]=t["phot_g_mean_mag"]-gt
print(t["source_id","sep","phot_g_mean_mag","dG","bp_rp","parallax","ruwe"][:15])
for tab in ["vari_summary","vari_eclipsing_binary","nss_two_body_orbit","nss_acceleration_astro","nss_non_linear_spectro","nss_vim_fl"]:
    try:
        r=Gaia.launch_job(f"SELECT * FROM gaiadr3.{tab} WHERE source_id IN ({','.join(str(s) for s in t['source_id'][:20])})").get_results()
        out[f"gaia_{tab}"]=[{"source_id":int(x["source_id"])} for x in r]; print(tab,len(r), list(r["source_id"]) if len(r) else "")
    except Exception as e: out[f"gaia_{tab}"]=f"ERR {e}"; print(tab,"ERR",e)
c=SkyCoord(RA*u.deg,DEC*u.deg)
for cat,name in [("B/vsx/vsx","VSX"),("J/ApJS/258/16","TESS EB (Prsa+2022)"),("J/MNRAS/519/3546","Howard? EB"),("I/358/veb","Gaia DR3 vari EB (VizieR)")]:
    try:
        r=Vizier(row_limit=50).query_region(c,radius=2*u.arcmin,catalog=cat)
        out[name]=[str(x) for x in r] if len(r) else []
        print(name,cat,"tables:",len(r)); 
        for x in r: print(x)
    except Exception as e: out[name]=f"ERR {e}"; print(name,"ERR",e)
try:
    s=Simbad(); s.add_votable_fields("otype","sp")
    r=s.query_region(c,radius=2*u.arcmin); out["SIMBAD"]=None if r is None else [list(map(str,x)) for x in r]
    print(r)
except Exception as e: out["SIMBAD"]=f"ERR {e}"; print("SIMBAD ERR",e)
json.dump(out,open("data/step5_catalogs.json","w"),indent=1,default=str)
print(json.dumps(out["gaia_target"],indent=0,default=str))
