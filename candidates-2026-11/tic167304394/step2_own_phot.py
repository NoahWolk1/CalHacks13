"""Own TESScut photometry of the two deep events: 4 apertures x 2 backgrounds, column-wise background, comparison stars;
plus the S89 3733.31 epoch. Depth = fixed-shape V template (from step5 centre fits) scaled + quadratic baseline."""
import warnings; warnings.filterwarnings("ignore")
import json, glob, numpy as np, lightkurve as lk
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
from astropy.coordinates import SkyCoord; import astropy.units as u
from scipy.ndimage import maximum_filter
from common import RA, DEC
EVS={31:2169.2210,67:3148.7519,89:3733.31}
HW=1.688/24; K=1.39
def tmpl(t,tc): x=np.abs(t-tc)/HW; return np.clip(1-x**K,0,None)
def fitdepth(t,y,tc,win=0.6):
    g=np.isfinite(y)&(np.abs(t-tc)<win); t=t[g]; y=y[g]/np.nanmedian(y[g])
    s=tmpl(t,tc); A=np.vstack([-s,np.ones_like(t),t-tc,(t-tc)**2]).T
    c,*_=np.linalg.lstsq(A,y,rcond=None); r=y-A@c
    # red-noise error: slide the template over +-(0.3..1.5) d
    return c[0], np.std(r)*np.sqrt(np.linalg.pinv(A.T@A)[0,0])
def ap(shape,x0,y0,r):
    Y,X=np.mgrid[:shape[0],:shape[1]]; return (X-x0)**2+(Y-y0)**2<=r**2
res={}
fig,axs=plt.subplots(3,1,figsize=(10,10))
for a_,(s,tc) in zip(axs,EVS.items()):
    f=glob.glob(f"data/tesscut/**/tess-s{s:04d}*.fits",recursive=True)[0]
    tpf=lk.read(f); t=tpf.time.value; F=tpf.flux.value.astype(float); q=tpf.quality
    good=(q==0)&np.all(np.isfinite(F),axis=(1,2))
    med=np.nanmedian(F[good],0)
    xt,yt=[float(v) for v in tpf.wcs.world_to_pixel(SkyCoord(RA*u.deg,DEC*u.deg))]
    Y,X=np.mgrid[:med.shape[0],:med.shape[1]]; rr=np.hypot(X-xt,Y-yt)
    skyg=med<np.nanpercentile(med,40)
    ann=(rr>5)&(rr<9)&(med<np.nanpercentile(med[(rr>5)&(rr<9)],60))
    R=dict(sector=s,tc=tc,target_px=[round(xt,2),round(yt,2)],cadence_min=round(float(np.nanmedian(np.diff(t))*1440),1))
    for bname,skym in [("global40",skyg),("annulus",ann),("column",None)]:
        if skym is None:
            # per-column background from the faintest 40% of pixels in that column
            Fb=F.copy()
            for x in range(F.shape[2]):
                col=med[:,x]; sm=col<np.nanpercentile(col,40)
                Fb[:,:,x]-=np.nanmedian(F[:,sm,x],axis=1)[:,None]
        else:
            Fb=F-np.nanmedian(F[:,skym],axis=1)[:,None,None]
        for r_ap in [1.0,1.5,2.5,3.5]:
            A_=ap(med.shape,xt,yt,r_ap); lc=np.nansum(Fb[:,A_],1); y=lc.copy(); y[~good]=np.nan
            d,e=fitdepth(t,y,tc)
            # empirical sigma
            sl=[fitdepth(t,y,tc+o)[0] for o in np.r_[np.arange(-2.5,-0.4,0.1),np.arange(0.4,2.5,0.1)] if np.isfinite(y[np.abs(t-tc-o)<0.1]).sum()>3]
            se=1.4826*np.nanmedian(np.abs(np.array(sl)-np.nanmedian(sl))) if len(sl)>5 else np.nan
            R[f"{bname}_r{r_ap}"]=dict(npix=int(A_.sum()),depth_ppt=round(d*1e3,2),sig=round(float(np.nanmax([e,se]))*1e3,2))
            if bname=="global40" and r_ap in (1.0,2.5): 
                w=good&(np.abs(t-tc)<0.6); a_.plot((t[w]-tc)*24,(y[w]/np.nanmedian(y[w])-1)*1e3-(0 if r_ap==1 else 30),".",ms=2,label=f"r={r_ap}: {d*1e3:.1f} ppt")
        if bname=="global40":
            medb=np.nanmedian(Fb[good],0)
            pk=(medb==maximum_filter(medb,size=5))&(medb>0.05*medb[int(round(yt)),int(round(xt))])
            comps=[]
            for yy,xx in zip(*np.where(pk)):
                if np.hypot(xx-xt,yy-yt)<3 or min(xx,yy)<2 or max(xx,yy)>18: continue
                A_=ap(medb.shape,xx,yy,1.5); lc=np.nansum(Fb[:,A_],1); y=lc.copy(); y[~good]=np.nan
                d,e=fitdepth(t,y,tc)
                comps.append(dict(x=int(xx),y=int(yy),sep_px=round(float(np.hypot(xx-xt,yy-yt)),1),rel=round(float(medb[yy,xx]/medb[int(round(yt)),int(round(xt))]),3),depth_ppt=round(d*1e3,2),sig_white=round(e*1e3,2)))
            R["comparison_stars"]=comps
    a_.set_title(f"S{s} own TESScut photometry, centre {tc}",fontsize=9); a_.legend(fontsize=7); a_.set_xlabel("hours")
    res[s]=R; print(json.dumps(R),flush=True)
fig.tight_layout(); fig.savefig("figs/own_phot.png",dpi=100)
json.dump(res,open("data/step2_own_phot.json","w"),indent=1)
