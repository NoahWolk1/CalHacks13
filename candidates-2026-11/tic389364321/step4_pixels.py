"""S31 2-min TPF: (a) where does the variability live (per-pixel regression on the aperture light curve);
(b) per-pixel deficit at the event; (c) depth and variability amplitude vs aperture size."""
import warnings; warnings.filterwarnings("ignore")
import glob, json, numpy as np, lightkurve as lk
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
from astropy.coordinates import SkyCoord; import astropy.units as u
from measure import measure
from common import RA, DEC, TC, DUR
out={}
fig,axs=plt.subplots(3,4,figsize=(16,12))
for k,s in enumerate([30,31,32]):
    f=glob.glob(f"data/tpf/**/*s00{s}*tp.fits",recursive=True)[0]
    tpf=lk.read(f); t=tpf.time.value; F=tpf.flux.value.astype(float); q=tpf.quality
    g=(q==0)&np.all(np.isfinite(F),axis=(1,2)); t=t[g]; F=F[g]
    ap=tpf.pipeline_mask
    xt,yt=[float(v) for v in tpf.wcs.world_to_pixel(SkyCoord(RA*u.deg,DEC*u.deg))]
    med=np.median(F,axis=0)
    # 1-h bins
    tb=np.arange(t.min(),t.max()+1/24,1/24); idx=np.digitize(t,tb)
    keep=[i for i in np.unique(idx) if (idx==i).sum()>15]
    T=np.array([t[idx==i].mean() for i in keep]); FB=np.array([F[idx==i].mean(0) for i in keep])
    lc=FB[:,ap].sum(1); tmpl=lc/np.median(lc)-1
    # remove slow trend from template & pixels: per-orbit quadratic
    orb=(T>T.min()+ (T.max()-T.min())/2) if s!=31 else (T>2157.5)
    def detr(y):
        r=y.copy()
        for o in [~orb,orb]:
            c=np.polyfit(T[o]-T[o].mean(),y[o],2); r[o]=y[o]-np.polyval(c,T[o]-T[o].mean())
        return r
    tm=detr(tmpl)
    A=np.zeros(med.shape)
    for i in range(med.shape[0]):
        for j in range(med.shape[1]):
            y=detr(FB[:,i,j]); A[i,j]=np.dot(y,tm)/np.dot(tm,tm)   # e-/s per unit fractional template
    frac=A/med; 
    res=dict(sector=s, aperture_flux=float(med[ap].sum()), target_px=[xt,yt],
             amp_tm_ppt=float(np.std(tm)*1e3),
             var_flux_in_ap_frac=float(A[ap].sum()/med[ap].sum()))
    # fraction of variability-weighted flux on target pixels vs elsewhere
    Y,X=np.mgrid[:med.shape[0],:med.shape[1]]; rr=np.hypot(X-xt,Y-yt)
    res["A_within_1.5px"]=float(A[rr<1.5].sum()); res["A_total_pos"]=float(A[A>0].sum())
    res["A_peak_px"]=[int(v) for v in np.unravel_index(np.argmax(A),A.shape)]
    res["flux_peak_px_near_target"]=[int(v) for v in np.unravel_index(np.argmax(np.where(rr<2,med,0)),med.shape)]
    # neighbour bright pixel group at ~3px (row 4,col 3) and (row 9,col 0)
    for name,(ii,jj) in {"nbr_r4c3":(4,3),"nbr_r9c0":(9,0),"target_r6c6":(6,6),"target_r5c6":(5,6)}.items():
        res[name]=dict(med=float(med[ii,jj]),A=float(A[ii,jj]),A_over_med=float(frac[ii,jj]))
    ax=axs[k]
    im=ax[0].imshow(med,origin='lower',vmin=0,vmax=np.percentile(med,99)); ax[0].set_title(f"S{s} median flux"); ax[0].plot(xt,yt,'r+')
    ax[0].contour(ap,levels=[0.5],colors='w',linewidths=.8)
    v=np.percentile(np.abs(A),99); ax[1].imshow(A,origin='lower',cmap='RdBu_r',vmin=-v,vmax=v); ax[1].plot(xt,yt,'k+'); ax[1].set_title("variability amplitude A (e-/s)")
    if s==31:
        ev=(t>TC-DUR/2+0.03)&(t<TC+DUR/2-0.03); bl=((t>TC-0.75)&(t<TC-0.25))|((t>TC+0.25)&(t<TC+0.75))
        D=F[bl].mean(0)-F[ev].mean(0)
        v=np.percentile(np.abs(D),99); ax[2].imshow(D,origin='lower',cmap='RdBu_r',vmin=-v,vmax=v); ax[2].plot(xt,yt,'k+'); ax[2].set_title("S31 event deficit (baseline - in)")
        res["deficit_within_1.5px"]=float(D[rr<1.5].sum()); res["deficit_frac_ap"]=float(D[ap].sum()/med[ap].sum())
        res["deficit_peak_px"]=[int(v) for v in np.unravel_index(np.argmax(D),D.shape)]
        res["deficit_nbr_r4c3_frac"]=float(D[3:6,2:5].sum()/med[3:6,2:5].sum())
        # aperture growth: event depth and variability amplitude in circular apertures
        grow=[]
        bkg_px=med<np.percentile(med,30)
        bk=np.median(F[:,bkg_px],axis=1)
        for r_ in [1.0,1.5,2.0,2.5,3.0,4.0]:
            apc=rr<=r_
            for bsub in [False,True]:
                y=F[:,apc].sum(1)-(bk*apc.sum() if bsub else 0)
                m=measure(t,y,TC,DUR,win=1.0)
                grow.append(dict(r=r_,npix=int(apc.sum()),bkg_sub=bsub,depth_ppt=round(m['depth']*1e3,2),sig=round(m['sig_adopt']*1e3,2)))
        m=measure(t,F[:,ap].sum(1),TC,DUR,win=1.0); grow.append(dict(r="SPOC ap",npix=int(ap.sum()),depth_ppt=round(m['depth']*1e3,2),sig=round(m['sig_adopt']*1e3,2)))
        res["aperture_growth"]=grow
        ax[3].plot(T,lc/np.median(lc),'k.',ms=2); ax[3].axvspan(TC-DUR/2,TC+DUR/2,color='orange',alpha=.3); ax[3].set_xlim(TC-2,TC+3); ax[3].set_title("SPOC-aperture 1h bins")
        ax[3].set_ylim(0.97,1.03)
    else:
        ax[2].axis('off'); ax[3].plot(T,lc/np.median(lc),'k.',ms=2); ax[3].set_title(f"S{s} aperture 1h bins")
    out[f"S{s}"]=res; print(json.dumps(res,indent=0)[:3000])
fig.tight_layout(); fig.savefig("figs/step4_pixels.png",dpi=90)
json.dump(out,open("data/step4_pixels.json","w"),indent=1)
