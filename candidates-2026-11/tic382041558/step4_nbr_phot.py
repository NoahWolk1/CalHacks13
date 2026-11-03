"""Aperture photometry centred on the G=15.86 neighbour (Gaia DR3 4761328283954529792, 32"), plus the same r=1 px box on
star-free control spots at similar background (to see whether scattered-light structure alone makes such deficits)."""
import warnings; warnings.filterwarnings("ignore")
import glob, json, numpy as np, lightkurve as lk
from astropy.table import Table
from measure import measure
from common import TC, DUR
tpf=lk.read(glob.glob("data/tesscut/tesscut/tess-s0039*.fits")[0]); t=tpf.time.value; F=tpf.flux.value.astype(float); fin=np.all(np.isfinite(F),axis=(1,2))
g=Table.read("data/gaia_2arcmin.csv"); gx,gy=tpf.wcs.world_to_pixel_values(np.array(g["ra"]),np.array(g["dec"]))
Y,X=np.mgrid[:F.shape[1],:F.shape[2]]; med=np.nanmedian(F[fin],0)
A=None
faint=(med<np.nanpercentile(med,40))&(np.hypot(X-gx[0],Y-gy[0])>3)
M=np.vstack([np.ones(faint.sum()),X[faint],Y[faint]]).T; co=np.linalg.lstsq(M,np.nan_to_num(F[:,faint]).T,rcond=None)[0]
out={}
def phot(x0,y0,rap):
    ap=np.hypot(X-x0,Y-y0)<=rap; b=co[0][:,None]+co[1][:,None]*X[ap][None]+co[2][:,None]*Y[ap][None]
    lc=np.nansum(F[:,ap]-b,1); e=lc[fin]
    m=measure(t[fin],e,TC,DUR,1.0); return dict(npix=int(ap.sum()),flux=float(np.median(e)),deficit_e=float(m['depth']*np.median(e)),depth_ppt=float(m['depth']*1e3),sig_ppt=float(m['sig_adopt']*1e3),deficit_sig_e=float(m['sig_adopt']*np.median(e)),frac_deeper=float(m['frac_deeper']))
for rap in [0.8,1.0,1.5]:
    out[f'nbr_r{rap}']=phot(gx[1],gy[1],rap); out[f'target_r{rap}']=phot(gx[0],gy[0],rap)
    print(rap,'nbr',out[f'nbr_r{rap}'],'\n    target',out[f'target_r{rap}'])
# control spots: star-free (med below 50th pct within r=1), >3 px from target
ctrl=[]
for yy in range(2,19):
    for xx in range(2,19):
        ap=np.hypot(X-xx,Y-yy)<=1.0
        if np.hypot(xx-gx[0],yy-gy[0])<3 or np.nanmax(med[ap])>np.nanpercentile(med,50): continue
        p=phot(xx,yy,1.0); ctrl.append(p['deficit_e'])
ctrl=np.array(ctrl); nb=out['nbr_r1.0']['deficit_e']
out['control_r1_deficits_e']=dict(n=int(len(ctrl)),median=float(np.median(ctrl)),std=float(np.std(ctrl)),frac_ge_nbr=float((ctrl>=nb).mean()),p95=float(np.percentile(ctrl,95)))
print(out['control_r1_deficits_e'])
json.dump(out,open('data/step4_nbr_phot.json','w'),indent=1)
