"""Small-aperture photometry centred on the 42" neighbour (Gaia DR3 4757827919969385088 = TIC 149217623, T 15.2) and on the target,
plus 'blank-sky' apertures of the same size, at both events. If the deficit is equal in e/s in blank apertures, it is background."""
import warnings; warnings.filterwarnings("ignore")
import glob, json, numpy as np, lightkurve as lk
from astropy.table import Table
from measure import measure
from cfg import *
g=Table.read("data/gaia_2arcmin.csv"); ib=int(np.argmin(np.abs(np.array(g["sep"])-41.7)))
out={}
for S,tc in [(1,TC),(63,TC2)]:
    tpf=lk.read(glob.glob(f"data/tesscut/**/tess-s{S:04d}*.fits",recursive=True)[0]); t=tpf.time.value; F=tpf.flux.value.astype(float); q=tpf.quality
    good=np.all(np.isfinite(F),axis=(1,2))&(q==0); med=np.nanmedian(F[good],0); onsi=med>1; Y,X=np.mgrid[:21,:21]
    xt,yt=tpf.wcs.world_to_pixel_values(RA,DEC); xn,yn=tpf.wcs.world_to_pixel_values(g["ra"][ib],g["dec"][ib])
    faint=onsi&(med<np.nanpercentile(med[onsi],30))&(np.hypot(X-xt,Y-yt)>3); bkg=np.nanmedian(F[:,faint],1)
    o={}
    # blank apertures: 2x2 px boxes on faint pixels, >3 px from target
    blanks=[(x,y) for x in range(1,20,3) for y in range(1,20,3) if onsi[y,x] and onsi[min(y+1,20),min(x+1,20)] and np.hypot(x-xt,y-yt)>3.5 and med[y:y+2,x:x+2].max()<np.nanpercentile(med[onsi],50)]
    for name,(x0,y0) in [("target",(xt,yt)),("neighbour_42arcsec",(xn,yn))]:
        ap=(np.hypot(X-x0,Y-y0)<=1.0)&onsi; lc=np.nansum(F[:,ap]-bkg[:,None],1); y=lc.copy(); y[~good]=np.nan
        m=measure(t,y,tc,DUR,1.0,2); o[name]=dict(npix=int(ap.sum()),flux=round(float(np.nanmedian(y)),1),depth_ppt=round(m["depth"]*1e3,2),sig=round(m["sig_adopt"]*1e3,2),deficit_e_per_px=round(m["depth"]*np.nanmedian(y)/ap.sum(),3))
    bd=[]
    for x,y0 in blanks:
        ap=np.zeros((21,21),bool); ap[y0:y0+2,x:x+2]=True; ap&=onsi
        lc=np.nansum(F[:,ap]-bkg[:,None],1)+1e4   # offset so the 'flux' is positive; depth*1e4 = deficit in e/s
        yy=lc.copy(); yy[~good]=np.nan; m=measure(t,yy,tc,DUR,1.0,2)
        if m and np.isfinite(m.get("depth",np.nan)): bd.append(m["depth"]*np.nanmedian(yy)/ap.sum())
    o["blank_apertures"]=dict(n=len(bd),median_deficit_e_per_px=round(float(np.median(bd)),3),sd=round(float(np.std(bd)),3),frac_positive=round(float(np.mean(np.array(bd)>0)),2))
    out[S]=o; print(S,json.dumps(o))
json.dump(out,open("data/step4_nbphot.json","w"),indent=1)
