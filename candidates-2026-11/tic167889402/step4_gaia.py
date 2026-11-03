"""Eclipse depth each Gaia DR3 neighbour would need to produce the 0.647 ppt dip (and the 0.2 ppt 2-sigma
upper limit we measure), assuming all its flux is in the aperture (G as a proxy for T)."""
import numpy as np, csv, json
rows=list(csv.DictReader(open("data/gaia_2arcmin.csv")))
t=rows[0]; G0=float(t['phot_g_mean_mag']); ra0=float(t['ra']); de0=float(t['dec'])
out=[]
for r in rows[1:]:
    G=float(r['phot_g_mean_mag']); sep=np.hypot((float(r['ra'])-ra0)*np.cos(np.radians(de0)),float(r['dec'])-de0)*3600
    fr=10**(-0.4*(G-G0)); need=0.647e-3*(1+fr)/fr
    out.append(dict(source_id=r['source_id'],sep=round(sep,2),G=round(G,2),dG=round(G-G0,2),plx=r['parallax'],ruwe=r['ruwe'],need_eclipse=round(need,3),need_for_0p2ppt=round(0.2e-3*(1+fr)/fr,3)))
out.sort(key=lambda x:x['need_eclipse'])
for o in out[:8]: print(o)
print("neighbours able to make 0.647 ppt (need < 100%):",sum(o['need_eclipse']<1 for o in out))
json.dump(out,open("data/step4_gaia.json","w"),indent=1)
