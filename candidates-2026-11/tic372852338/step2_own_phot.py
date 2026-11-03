"""Own TESScut photometry at the events: 4 apertures x 3 backgrounds (global faint-40%, annulus, column-wise);
4 h trapezoid + quadratic baseline (measure.py) with an empirical (slid) error. Also the background level/slope in the box
and two comparison stars in the cutout. Usage: step2_own_phot.py SECTOR:TC [SECTOR:TC ...]"""
import warnings; warnings.filterwarnings("ignore")
import sys, json, glob, numpy as np, lightkurve as lk
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
from astropy.coordinates import SkyCoord; import astropy.units as u
from scipy.ndimage import maximum_filter
from measure import measure
from common import RA, DEC, DUR
EVS=[(int(a.split(":")[0]),float(a.split(":")[1])) for a in sys.argv[1:]]
def ap(shape,x0,y0,r):
    Y,X=np.mgrid[:shape[0],:shape[1]]; return (X-x0)**2+(Y-y0)**2<=r**2
res={}; fig,axs=plt.subplots(len(EVS),1,figsize=(10,3.2*len(EVS)),squeeze=False)
for a_,(s,tc) in zip(axs[:,0],EVS):
    tpf=lk.read(glob.glob(f"data/tesscut/**/tess-s{s:04d}*.fits",recursive=True)[0])
    t=tpf.time.value; F=tpf.flux.value.astype(float); q=tpf.quality
    good=(q==0)&np.all(np.isfinite(F),axis=(1,2)); med=np.nanmedian(F[good],0)
    xt,yt=[float(v) for v in tpf.wcs.world_to_pixel(SkyCoord(RA*u.deg,DEC*u.deg))]
    Y,X=np.mgrid[:med.shape[0],:med.shape[1]]; rr=np.hypot(X-xt,Y-yt)
    skyg=med<np.nanpercentile(med,40); ann=(rr>5)&(rr<9)&(med<np.nanpercentile(med[(rr>5)&(rr<9)],60))
    R=dict(sector=s,tc=tc,target_px=[round(xt,2),round(yt,2)],n_good_in_box=int((good&(np.abs(t-tc)<DUR/2)).sum()))
    bk=np.nanmedian(F[:,skyg],axis=1); w=good&(np.abs(t-tc)<1)
    R["bkg_per_px_in_box"]=float(np.nanmedian(bk[good&(np.abs(t-tc)<DUR/2)])); R["bkg_per_px_range_pm1d"]=[float(np.nanmin(bk[w])),float(np.nanmax(bk[w]))]
    for bname,skym in [("global40",skyg),("annulus",ann),("column",None)]:
        if skym is None:
            Fb=F.copy()
            for x in range(F.shape[2]):
                col=med[:,x]; sm=col<np.nanpercentile(col,40); Fb[:,:,x]-=np.nanmedian(F[:,sm,x],axis=1)[:,None]
        else: Fb=F-np.nanmedian(F[:,skym],axis=1)[:,None,None]
        for r_ap in [1.0,1.5,2.5,3.5]:
            A_=ap(med.shape,xt,yt,r_ap); y=np.nansum(Fb[:,A_],1); y[~good]=np.nan
            m=measure(t,y,tc,DUR,1.0,2)
            if m is None or not np.isfinite(m.get("depth",np.nan)): R[f"{bname}_r{r_ap}"]=None; continue
            R[f"{bname}_r{r_ap}"]=dict(npix=int(A_.sum()),depth_ppt=round(m["depth"]*1e3,2),sig_ppt=round(m["sig_adopt"]*1e3,2),frac_deeper=round(m["frac_deeper"],3))
            if bname=="global40" and r_ap in (1.0,2.5):
                ww=good&(np.abs(t-tc)<1); a_.plot((t[ww]-tc)*24,(y[ww]/np.nanmedian(y[ww])-1)*1e3-(0 if r_ap==1 else 25),".",ms=3,label=f"own r={r_ap}: {m['depth']*1e3:.1f}±{m['sig_adopt']*1e3:.1f} ppt")
        if bname=="global40":
            medb=np.nanmedian(Fb[good],0); pk=(medb==maximum_filter(medb,size=5))&(medb>0.1*medb[int(round(yt)),int(round(xt))])
            comps=[]
            for yy,xx in zip(*np.where(pk)):
                if np.hypot(xx-xt,yy-yt)<3 or min(xx,yy)<2 or max(xx,yy)>med.shape[0]-3: continue
                A_=ap(medb.shape,xx,yy,1.5); y=np.nansum(Fb[:,A_],1); y[~good]=np.nan
                m=measure(t,y,tc,DUR,1.0,2)
                if m is None or not np.isfinite(m.get("depth",np.nan)): continue
                comps.append(dict(x=int(xx),y=int(yy),sep_px=round(float(np.hypot(xx-xt,yy-yt)),1),rel=round(float(medb[yy,xx]/medb[int(round(yt)),int(round(xt))]),3),depth_ppt=round(m["depth"]*1e3,2),sig_ppt=round(m["sig_adopt"]*1e3,2)))
            R["comparison_stars"]=comps
    a_.axvspan(-DUR*12,DUR*12,color="y",alpha=.2); a_.set_title(f"S{s} own TESScut photometry, tc {tc}",fontsize=9); a_.legend(fontsize=7); a_.set_xlabel("hours"); a_.set_ylim(-70,40)
    res[f"{s}:{tc}"]=R; print(json.dumps(R),flush=True)
fig.tight_layout(); fig.savefig("figs/step2_own_phot.png",dpi=100)
json.dump(res,open("data/step2_own_phot.json","w"),indent=1)
