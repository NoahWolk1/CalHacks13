"""The vet's 'repeats' at BTJD 2389.59 (S39) and 3772.15 (S90, QLP only): distance to sector/orbit edges and momentum dumps,
and the 6 h depth in every product (SPOC SAP/PDCSAP, TESS-SPOC, QLP SAP/KSPSAP/DET) plus our own TESScut photometry (r = 1.5, 2.5 px)."""
import warnings; warnings.filterwarnings("ignore")
import glob, json, numpy as np, lightkurve as lk
from astropy.coordinates import SkyCoord; import astropy.units as u
from lcio import load_all
from measure import measure
from common import RA, DEC, DUR, TC, TC2, TC3
out={}
for tc,sec in [(TC,30),(TC2,39),(TC3,90)]:
    rec=dict(products={})
    for r in [x for x in load_all() if x['sector']==sec]:
        t=r['t']; q=r['q']; fin=np.isfinite(t)
        rec.setdefault('edges',{})[r['author']]=dict(start=float(np.nanmin(t)),end=float(np.nanmax(t)),
             orbit_gap=[float(t[fin][np.argmax(np.diff(t[fin]))]),float(t[fin][np.argmax(np.diff(t[fin]))+1])],
             frac_q0_in_event=float((q[np.abs(t-tc)<DUR/2]==0).mean()) if (np.abs(t-tc)<DUR/2).any() else None,
             n_cadences_in_event_q0=int(((q==0)&(np.abs(t-tc)<DUR/2)).sum()))
        if r['author']=='SPOC':
            d=t[(q&32)>0]; rec['dumps_within_1d']=sorted(set(round(float(x),2) for x in d[np.abs(d-tc)<1]))
        for col in ['SAP_FLUX','PDCSAP_FLUX','KSPSAP_FLUX','DET_FLUX']:
            if col not in r: continue
            f=r[col]; g=(q==0)&np.isfinite(f)
            m=measure(t[g],f[g],tc,DUR,win=1.0,min_cov=0.3)
            if m is None or not np.isfinite(m.get('depth',np.nan)): rec['products'][f"{r['author']} {col}"]=dict(cov=None if m is None else round(m['cov'],2)); continue
            rec['products'][f"{r['author']} {col}"]=dict(depth_ppt=round(m['depth']*1e3,2),sig=round(m['sig_adopt']*1e3,2),cov=round(m['cov'],2),frac_deeper=round(float(m['frac_deeper']),3))
    fs=glob.glob(f"data/tesscut/**/tess-s00{sec}*.fits",recursive=True)
    if fs:
        tpf=lk.read(fs[0]); t=tpf.time.value; F=tpf.flux.value.astype(float); q=tpf.quality
        rec['tesscut_dumps_within_1d']=sorted(set(round(float(x),2) for x in t[((q&32)>0)&(np.abs(t-tc)<1)]))
        ok=np.all(np.isfinite(F),axis=(1,2))&(q==0); t=t[ok]; F=F[ok]
        x0,y0=[float(v) for v in tpf.wcs.world_to_pixel(SkyCoord(RA*u.deg,DEC*u.deg))]; Y,X=np.mgrid[:F.shape[1],:F.shape[2]]
        med=np.median(F,0); bk=np.median(F[:,med<np.percentile(med,20)],1)
        for rap in [1.5,2.5]:
            ap=np.hypot(X-x0,Y-y0)<=rap; lc=F[:,ap].sum(1)-bk*ap.sum()
            m=measure(t,lc,tc,DUR,win=1.0,min_cov=0.3)
            rec['products'][f"own TESScut r={rap}"]=dict(depth_ppt=round(m['depth']*1e3,2),sig=round(m['sig_adopt']*1e3,2),cov=round(m['cov'],2)) if m and np.isfinite(m.get('depth',np.nan)) else None
    out[f"{tc} (S{sec})"]=rec
print(json.dumps(out,indent=1)); json.dump(out,open("data/step3_repeats.json","w"),indent=1)
