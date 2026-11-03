"""SPOC 2-min TPFs S30-32: difference images (out-of-eclipse minus in-eclipse) for every OGLE-predicted eclipse in them,
a 2-D Gaussian fit to the stacked deficit image (free centre) compared with the Gaia positions of the target and of
the neighbours, and the eclipse depth vs aperture radius."""
import warnings; warnings.filterwarnings("ignore")
import glob, json, numpy as np, lightkurve as lk
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
from astropy.coordinates import SkyCoord; import astropy.units as u
from astropy.table import Table
from scipy.optimize import least_squares
from common import RA, DEC
P,E,SPH=20.1104183,3000.2755,0.3232
gaia=Table.read("data/gaia_2arcmin.csv")
out={}
fig,axs=plt.subplots(3,3,figsize=(14,13))
for k,s in enumerate([30,31,32]):
    f=glob.glob(f"data/tpf/**/*s00{s}*tp.fits",recursive=True)[0]
    tpf=lk.read(f); t=tpf.time.value; F=tpf.flux.value.astype(float); q=tpf.quality
    g=(q==0)&np.all(np.isfinite(F),axis=(1,2)); t=t[g]; F=F[g]
    ap=tpf.pipeline_mask; med=np.median(F,0)
    xt,yt=[float(v) for v in tpf.wcs.world_to_pixel(SkyCoord(RA*u.deg,DEC*u.deg))]
    ecl=[]
    for kk in range(-50,0):
        for off,lab,hw in [(0,"P",0.25),(SPH,"S",0.10)]:
            tc=E+(kk+off)*P
            if t.min()+0.5<tc<t.max()-0.5: ecl.append((lab,tc,hw))
    D=np.zeros_like(med); n=0; per=[]
    for lab,tc,hw in ecl:
        # primary: offsets from OGLE ephemeris are ~ -0.1 d in TESS; use TESS times of minimum from step5
        inn=np.abs(t-tc)<hw; oot=((t>tc-1.6)&(t<tc-0.9))|((t>tc+0.9)&(t<tc+1.6))
        if inn.sum()<20 or oot.sum()<50: continue
        d=F[oot].mean(0)-F[inn].mean(0); D+=d; n+=1
        per.append(dict(kind=lab,tc=round(tc,3),deficit_frac_ap=round(float(d[ap].sum()/F[oot][:,ap].sum(1).mean()),4)))
    D/=max(n,1)
    Y,X=np.mgrid[:med.shape[0],:med.shape[1]]
    def g2(p,img):
        a,x0,y0,sg,b=p; return (a*np.exp(-((X-x0)**2+(Y-y0)**2)/(2*sg**2))+b-img).ravel()
    sol=least_squares(g2,[D.max(),xt,yt,0.8,0],args=(D,)); solm=least_squares(g2,[med.max(),xt,yt,0.8,np.median(med)],args=(med,))
    # px -> arcsec offset of fitted centre from target
    c=tpf.wcs.pixel_to_world(sol.x[1],sol.x[2]); cm=tpf.wcs.pixel_to_world(solm.x[1],solm.x[2])
    tgt=SkyCoord(RA*u.deg,DEC*u.deg)
    res=dict(sector=s,n_eclipses=n,eclipses=per,target_px=[round(xt,2),round(yt,2)],deficit_fit_px=[round(sol.x[1],2),round(sol.x[2],2)],
             deficit_fit_offset_arcsec=round(float(c.separation(tgt).arcsec),1),median_image_fit_offset_arcsec=round(float(cm.separation(tgt).arcsec),1),
             deficit_minus_median_centre_arcsec=round(float(c.separation(cm).arcsec),1),deficit_sigma_px=round(sol.x[3],2))
    # nearest Gaia stars to the deficit centre
    gc=SkyCoord(gaia['ra'],gaia['dec'],unit='deg'); sep=gc.separation(c).arcsec; o=np.argsort(sep)[:4]
    res["gaia_nearest_to_deficit"]=[dict(source_id=int(gaia['source_id'][i]),G=round(float(gaia['phot_g_mean_mag'][i]),2),sep_from_deficit=round(float(sep[i]),1),sep_from_target=round(float(gaia['sep'][i]),1)) for i in o]
    # aperture growth on the summed eclipse signal
    rr=np.hypot(X-xt,Y-yt); grow=[]
    for r_ in [1.0,1.5,2.0,3.0,4.0]:
        a=rr<=r_; grow.append(dict(r=r_,npix=int(a.sum()),deficit_frac=round(float(D[a].sum()/med[a].sum()),4)))
    res["aperture_growth_mean_eclipse"]=grow
    out[f"S{s}"]=res; print(json.dumps(res))
    ax=axs[k]
    ax[0].imshow(med,origin='lower'); ax[0].contour(ap,levels=[0.5],colors='w'); ax[0].plot(xt,yt,'r+',ms=12); ax[0].set_title(f"S{s} median")
    v=np.percentile(np.abs(D),99.5); ax[1].imshow(D,origin='lower',cmap='RdBu_r',vmin=-v,vmax=v); ax[1].plot(xt,yt,'k+',ms=12); ax[1].plot(sol.x[1],sol.x[2],'gx',ms=10); ax[1].set_title(f"mean eclipse deficit ({n} eclipses)")
    gx,gy=tpf.wcs.world_to_pixel(gc[gaia['phot_g_mean_mag']<17]); ax[1].plot(gx,gy,'o',mfc='none',mec='0.4',ms=5)
    ax[1].set_xlim(-0.5,med.shape[1]-0.5); ax[1].set_ylim(-0.5,med.shape[0]-0.5)
    ax[2].imshow(D/np.maximum(med,1),origin='lower',cmap='RdBu_r',vmin=-0.06,vmax=0.06); ax[2].plot(xt,yt,'k+',ms=12); ax[2].set_title("deficit / median (fractional)")
fig.tight_layout(); fig.savefig("figs/step4_diffimage.png",dpi=85)
json.dump(out,open("data/step4_diffimage.json","w"),indent=1)
