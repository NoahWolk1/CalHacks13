"""Event depth (4 h trapezoid, +-1 d quadratic baseline per segment, measure.py) in every QLP S30 column, and in our own S30 TESScut
photometry: circular apertures centred on the target and on Gaia DR3 4660118479179211904 (the star the event localises on, 14.1"),
with a faint-pixel background. Re-centred epoch and duration from a trapezoid grid on QLP SAP."""
import warnings; warnings.filterwarnings("ignore")
import glob, json, numpy as np, lightkurve as lk
from astropy.coordinates import SkyCoord; import astropy.units as u
from lcio import load_all
from measure import measure, fit_depth
from common import RA, DEC, TC, DUR
out=dict(qlp={},own={})
r=[x for x in load_all(["QLP"]) if x['sector']==30][0]
for col in ['SAP_FLUX','KSPSAP_FLUX','KSPSAP_FLUX_SML','KSPSAP_FLUX_LAG']:
    t=r['t']; f=r[col]; g=(r['q']==0)&np.isfinite(f)
    m=measure(t[g],f[g],TC,DUR,win=1.0)
    out['qlp'][col]=dict(depth_ppt=round(m['depth']*1e3,1),sig=round(m['sig_adopt']*1e3,1),beta=round(m['beta'],2),frac_deeper=round(float(m['frac_deeper']),3))
# recentre: grid in tc, duration on SAP
t=r['t']; f=r['SAP_FLUX']; g=(r['q']==0)&np.isfinite(f); best=None
for tc in np.arange(TC-0.1,TC+0.1,0.005):
    for dur in np.arange(0.1,0.45,0.01):
        x=fit_depth(t[g],f[g]/np.median(f[g]),tc,dur,1.0,2)
        if x and np.isfinite(x.get('depth',np.nan)):
            chi=np.sum((x['f']-x['model'])**2)
            if best is None or chi<best[0]: best=(chi,tc,dur,x['depth'])
out['recentred']=dict(tc=round(best[1],3),dur_h=round(best[2]*24,1),depth_ppt=round(best[3]*1e3,1))
tpf=lk.read(glob.glob("data/tesscut/**/tess-s0030*.fits",recursive=True)[0])
tt=tpf.time.value; F=tpf.flux.value.astype(float); q=tpf.quality; ok=np.all(np.isfinite(F),axis=(1,2))&(q==0); tt=tt[ok]; F=F[ok]
med=np.median(F,0); bk=np.median(F[:,med<np.percentile(med,20)],1)
Y,X=np.mgrid[:F.shape[1],:F.shape[2]]
for name,(ra,dec) in {"target":(RA,DEC),"Gaia ...211904 (14.1\")":(83.05377664715544,-67.67269814647716)}.items():
    x0,y0=[float(v) for v in tpf.wcs.world_to_pixel(SkyCoord(ra*u.deg,dec*u.deg))]
    for rap in [0.75,1.0,1.5,2.0,3.0]:
        ap=np.hypot(X-x0,Y-y0)<=rap
        for bs in [False,True]:
            lc=F[:,ap].sum(1)-(bk*ap.sum() if bs else 0)
            m=measure(tt,lc,TC,DUR,win=1.0)
            out['own'][f"{name} r={rap} {'bkg-sub' if bs else 'raw'}"]=dict(npix=int(ap.sum()),depth_ppt=round(m['depth']*1e3,1),sig=round(m['sig_adopt']*1e3,1))
print(json.dumps(out,indent=1)); json.dump(out,open("data/step2_archival.json","w"),indent=1)
