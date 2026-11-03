"""Own TESScut photometry at the event: 6 apertures x 3 backgrounds (global faint-pixel median, local annulus, column-wise).
Depth from measure.py (trapezoid + quadratic baseline per segment), sigma = max(white*beta, empirical slide).
Also: the background level itself (e-/s summed over the aperture) through the event, comparison stars in the cutout,
and the background-pixel 'light curve'. Usage: step2_own_phot.py SECTOR TC DUR_H [qualmode]"""
import warnings, json, glob, sys; warnings.filterwarnings("ignore")
import numpy as np, lightkurve as lk
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
from astropy.coordinates import SkyCoord; import astropy.units as u
from scipy.ndimage import maximum_filter
from measure import measure
from common import RA, DEC
S=int(sys.argv[1]); TC=float(sys.argv[2]); DUR=float(sys.argv[3])/24; QM=sys.argv[4] if len(sys.argv)>4 else "q0"
f=glob.glob(f"data/tesscut/**/tess-s{S:04d}*.fits",recursive=True)[0]
tpf=lk.read(f, quality_bitmask="none"); t=tpf.time.value; F=tpf.flux.value.astype(float); q=np.array(tpf.quality)
fin=np.all(np.isfinite(F),axis=(1,2))&np.isfinite(t)
good=fin&((q==0) if QM=="q0" else np.ones_like(fin))
win=np.abs(t-TC)<1.0
med=np.nanmedian(F[good&win],0)
xt,yt=[float(v) for v in tpf.wcs.world_to_pixel(SkyCoord(RA*u.deg,DEC*u.deg))]
Y,X=np.mgrid[:med.shape[0],:med.shape[1]]; rr=np.hypot(X-xt,Y-yt)
print("sector",S,"cam/ccd",tpf.camera,tpf.ccd,"target px",round(xt,2),round(yt,2),"cadence min",round(np.nanmedian(np.diff(t))*1440,2),
      "q!=0 in event:",np.unique(q[np.abs(t-TC)<DUR/2]), "frac good in +-1d", good[win].mean())
skyg=med<np.nanpercentile(med,30)
annzone=(rr>5)&(rr<9); ann=annzone&(med<np.nanpercentile(med[annzone],50))
bk={}
bk["global30"]=np.nanmedian(F[:,skyg],axis=1)[:,None,None]*np.ones((1,)+med.shape)
bk["annulus"]=np.nanmedian(F[:,ann],axis=1)[:,None,None]*np.ones((1,)+med.shape)
Bc=np.zeros_like(F)
for x in range(F.shape[2]):
    col=med[:,x]; sm=col<np.nanpercentile(col,40)
    Bc[:,:,x]=np.nanmedian(F[:,sm,x],axis=1)[:,None]
bk["column"]=Bc
def ap(r): return rr<=r
R=dict(sector=S,tc=TC,dur_h=DUR*24,qual=QM,target_px=[round(xt,2),round(yt,2)],res={})
fig,axs=plt.subplots(3,1,figsize=(10,11))
for bname,B in bk.items():
    Fb=F-B
    for r_ap in [1.0,1.5,2.0,2.5,3.0,3.5]:
        A=ap(r_ap); lc=np.nansum(Fb[:,A],1); y=lc.copy(); y[~good]=np.nan
        res=measure(t,y,TC,DUR)
        bsum=np.nansum(B[:,A],1)
        o=dict(npix=int(A.sum()),star_eps=round(float(np.nanmedian(lc[good&win])),1),
               bkg_eps_range=[round(float(np.nanmin(bsum[good&win])),1),round(float(np.nanmax(bsum[good&win])),1)],
               bkg_change_in_event=round(float(np.nanmedian(bsum[good&(np.abs(t-TC)<DUR/2)])-np.nanmedian(bsum[good&win&(np.abs(t-TC)>DUR)])),1))
        if res is not None and np.isfinite(res.get("depth",np.nan)):
            o.update(depth_ppt=round(res["depth"]*1e3,2),sig=round(res["sig_adopt"]*1e3,2),beta=round(res["beta"],2),frac_deeper=round(float(res["frac_deeper"]),3),cov=round(float(res["cov"]),2))
        R["res"][f"{bname}_r{r_ap}"]=o
        print(bname,r_ap,o,flush=True)
        if r_ap in (1.0,2.5) :
            k=list(bk).index(bname); w=good&win
            axs[k].plot((t[w]-TC)*24,(y[w]/np.nanmedian(y[w])-1)*1e3-(0 if r_ap==1 else 15),".",ms=2,label=f"r={r_ap}: {o.get('depth_ppt')} ± {o.get('sig')} ppt")
    axs[list(bk).index(bname)].set_title(f"S{S} own photometry, background {bname}",fontsize=9); axs[list(bk).index(bname)].legend(fontsize=7)
    axs[list(bk).index(bname)].axvspan(-DUR*12,DUR*12,alpha=.15,color="orange")
axs[-1].set_xlabel("hours from "+str(TC)); fig.tight_layout(); fig.savefig(f"figs/step2_own_phot_S{S}_{QM}.png",dpi=90)
# comparison stars and sky pixels (annulus background)
Fb=F-bk["annulus"]; medb=np.nanmedian(Fb[good&win],0)
pk=(medb==maximum_filter(medb,size=5))&(medb>0.03*medb[int(round(yt)),int(round(xt))])
comps=[]
for yy,xx in zip(*np.where(pk)):
    if np.hypot(xx-xt,yy-yt)<3 or min(xx,yy)<2 or max(xx,yy)>18: continue
    A=np.hypot(X-xx,Y-yy)<=1.5; y=np.nansum(Fb[:,A],1); y[~good]=np.nan
    res=measure(t,y,TC,DUR)
    if res is None or not np.isfinite(res.get("depth",np.nan)): continue
    comps.append(dict(x=int(xx),y=int(yy),sep_px=round(float(np.hypot(xx-xt,yy-yt)),1),rel=round(float(medb[yy,xx]/medb[int(round(yt)),int(round(xt))]),3),
                      depth_ppt=round(res["depth"]*1e3,2),sig=round(res["sig_adopt"]*1e3,2)))
R["comparison_stars"]=comps; print("comparison stars",comps)
# raw sky pixels (no background subtraction): sum of faint pixels — does the sky itself show the event?
sky=np.nanmean(F[:,skyg],1); y=sky.copy(); y[~good]=np.nan
ww=good&win; x=t[ww]-TC; s_in=np.abs(x)<DUR/2
A=np.vstack([np.ones_like(x),x,x**2,s_in.astype(float)]).T; c,*_=np.linalg.lstsq(A,y[ww],rcond=None)
R["sky_pixel_step_in_event_eps_per_px"]=round(float(c[3]),3); R["sky_level_eps_per_px"]=round(float(np.nanmedian(y[ww])),2)
print("sky pixels: in-event excess (e/s/px, quadratic baseline)",c[3],"median level",np.nanmedian(y[ww]))
json.dump(R,open(f"data/step2_own_phot_S{S}_{QM}.json","w"),indent=1)
