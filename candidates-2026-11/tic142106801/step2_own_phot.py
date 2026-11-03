"""Own TESScut photometry, S7 and S87: circular apertures r = 1..3 px, with and without a local (annulus 5-8 px, sigma-clipped
median) background; depth at the event; size of the S7 step at 1492.85; per-pixel step and deficit images."""
import warnings; warnings.filterwarnings("ignore")
import glob, json, numpy as np, lightkurve as lk
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
from astropy.coordinates import SkyCoord; import astropy.units as u
from measure import measure
from common import RA, DEC, TC, DUR, TC2
out={}
fig,axs=plt.subplots(2,4,figsize=(18,9))
for k,(s,tc) in enumerate([(7,TC),(87,TC2)]):
    f=glob.glob(f"data/tesscut/**/*s00{s:02d}*.fits",recursive=True)[0]
    tpf=lk.read(f); t=tpf.time.value; F=tpf.flux.value.astype(float); q=tpf.quality
    g=(q==0)&np.all(np.isfinite(F),axis=(1,2)); 
    print("S",s,"frames",len(t),"q0",g.sum(), "flags in event", np.unique(q[np.abs(t-tc)<DUR/2]))
    t=t[g]; F=F[g]
    xt,yt=[float(v) for v in tpf.wcs.world_to_pixel(SkyCoord(RA*u.deg,DEC*u.deg))]
    Y,X=np.mgrid[:F.shape[1],:F.shape[2]]; rr=np.hypot(X-xt,Y-yt)
    ann=(rr>5)&(rr<8)
    bk=np.array([np.median(np.sort(fr[ann])[:int(ann.sum()*0.7)]) for fr in F])  # lower 70% median: avoids stars
    res=dict(target_px=[xt,yt],bkg_median=float(np.median(bk)),bkg_in_event=float(np.median(bk[np.abs(t-tc)<DUR/2])))
    grow=[]
    for r_ in [1.0,1.5,2.0,2.5,3.0]:
        ap=rr<=r_
        for bsub in [False,True]:
            y=F[:,ap].sum(1)-(bk*ap.sum() if bsub else 0)
            m=measure(t,y,tc,DUR,win=1.0)
            d=dict(r=r_,npix=int(ap.sum()),bkg_sub=bsub)
            if m is not None and np.isfinite(m.get('depth',np.nan)): d.update(depth_ppt=round(m['depth']*1e3,2),sig=round(m['sig_adopt']*1e3,2),beta=round(m['beta'],2),frac_deeper=round(float(m['frac_deeper']),3))
            if s==7:
                pre=(t>1492.0)&(t<1492.84); post=(t>1492.9)&(t<1493.7)
                d['step_post_minus_pre_ppt']=round(float((np.median(y[post])/np.median(y[pre])-1)*1e3),2)
            grow.append(d); print(s,d)
    res['aperture_growth']=grow
    med=np.median(F,axis=0)
    ax=axs[k]
    ax[0].imshow(med,origin='lower',vmin=np.percentile(med,5),vmax=np.percentile(med,99.5)); ax[0].plot(xt,yt,'r+'); ax[0].set_title(f"S{s} median")
    ev=np.abs(t-tc)<DUR/2-0.02; bl=(np.abs(t-tc)>0.3)&(np.abs(t-tc)<0.8)
    D=F[bl].mean(0)-F[ev].mean(0)
    if s==7:
        pre=(t>1492.0)&(t<1492.84); post=(t>1492.9)&(t<1493.7)
        S=F[post].mean(0)-F[pre].mean(0)
        v=np.percentile(np.abs(S),99); ax[1].imshow(S,origin='lower',cmap='RdBu_r',vmin=-v,vmax=v); ax[1].plot(xt,yt,'k+'); ax[1].set_title("S7 step: post(1492.9-93.7) - pre(1492.0-92.84)")
        res['step_peak_px']=[int(v) for v in np.unravel_index(np.argmax(np.abs(S)),S.shape)]
        res['step_peak_val']=float(S.flat[np.argmax(np.abs(S))]); res['step_within_1.5px']=float(S[rr<1.5].sum()); res['flux_within_1.5px']=float(med[rr<1.5].sum())
        res['step_peak_dist_px']=float(rr.flat[np.argmax(np.abs(S))])
        print('step image: peak px',res['step_peak_px'],'val',res['step_peak_val'],'dist',res['step_peak_dist_px'],'sum r<1.5',res['step_within_1.5px'],'flux r<1.5',res['flux_within_1.5px'])
        # list top 6 step pixels
        o=np.argsort(-np.abs(S).ravel())[:8]; res['step_top_px']=[(int(i//S.shape[1]),int(i%S.shape[1]),round(float(S.flat[i]),1),round(float(med.flat[i]),1),round(float(rr.flat[i]),2)) for i in o]; print(res['step_top_px'])
    else:
        bb=np.array([bk[np.abs(t-x)<1/48].mean() for x in t[::20]])
        ax[1].plot(t,bk,',k'); ax[1].axvspan(tc-DUR/2,tc+DUR/2,color='orange',alpha=.3); ax[1].set_xlim(tc-2,tc+2); ax[1].set_title('S87 own annulus background per px')
    v=np.percentile(np.abs(D),99); ax[2].imshow(D,origin='lower',cmap='RdBu_r',vmin=-v,vmax=v); ax[2].plot(xt,yt,'k+'); ax[2].set_title(f"S{s} event deficit (baseline - in)")
    res['deficit_within_1.5px_frac']=float(D[rr<1.5].sum()/med[rr<1.5].sum())
    for bsub,c in [(False,'r'),(True,'k')]:
        ap=rr<=1.5; y=F[:,ap].sum(1)-(bk*ap.sum() if bsub else 0); w=np.abs(t-tc)<2.5
        tb=np.arange(tc-2.5,tc+2.5,1/24); i=np.digitize(t[w],tb); yy=y[w]/np.median(y[w])
        yb=[np.mean(yy[i==j]) if (i==j).sum() else np.nan for j in range(1,len(tb))]
        ax[3].plot(tb[:-1]+1/48,np.array(yb)+(0 if bsub else 0.05),c+'.-',ms=3,label=f"r=1.5 bkgsub={bsub}")
    ax[3].axvspan(tc-DUR/2,tc+DUR/2,color='orange',alpha=.3); ax[3].legend(fontsize=7); ax[3].set_title(f"S{s} own phot, 1h bins")
    if s==87: ax[3].set_ylim(0.9,1.3)
    out[f"S{s}"]=res
fig.tight_layout(); fig.savefig("figs/step2_own_phot.png",dpi=85)
json.dump(out,open("data/step2_own_phot.json","w"),indent=1)
