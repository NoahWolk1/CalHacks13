"""Gaia stars closest to the fitted event position (S30 deficit image), and the Gaia counterpart of OGLE-LMC-ECL-34861."""
import json, numpy as np, glob, lightkurve as lk, sys
SEC=int(sys.argv[1]) if len(sys.argv)>1 else 30; SUF="" if SEC==30 else f"_s{SEC}"
from astropy.table import Table
d=json.load(open(f"data/step4_diffimage{SUF}.json")); g=Table.read("data/gaia_3arcmin.csv")
tpf=lk.read(glob.glob(f"data/tesscut/**/tess-s00{SEC}*.fits",recursive=True)[0])
gx,gy=tpf.wcs.world_to_pixel_values(np.array(g["ra"]),np.array(g["dec"]))
out={}
for lab in [k for k in d["fits"] if k.startswith("event") or "stack" in k]:
    v=d["fits"][lab]; r=np.hypot(gx-v["x"],gy-v["y"])*21; o=np.argsort(r)
    rows=[dict(source_id=int(g["source_id"][i]),dist_arcsec=round(float(r[i]),1),G=round(float(g["phot_g_mean_mag"][i]),2),bp_rp=None if np.ma.is_masked(g["bp_rp"][i]) else round(float(g["bp_rp"][i]),2),sep_from_target=round(float(g["sep"][i]),1)) for i in o if g["phot_g_mean_mag"][i]<18.5][:6]
    print("==",lab, "pos err (arcsec)", round(v["ex"]*21,1), round(v["ey"]*21,1)); [print("  ",x) for x in rows]; out[lab]=rows
ra,dec=15*(5+32/60+14.08/3600),-(67+40/60+45.1/3600)
r=np.hypot((np.array(g["ra"])-ra)*np.cos(np.radians(dec)),np.array(g["dec"])-dec)*3600; o=np.argsort(r)[:4]
print("== Gaia near OGLE-LMC-ECL-34861"); out["ecl34861"]=[dict(source_id=int(g["source_id"][i]),d=round(float(r[i]),2),G=float(g["phot_g_mean_mag"][i])) for i in o]; print(out["ecl34861"])
ra,dec=83.0571,-67.6792
json.dump(out,open(f"data/step4_where{SUF}.json","w"),indent=1)
