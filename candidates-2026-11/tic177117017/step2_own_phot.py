"""Own TESScut S3 photometry: target apertures + comparison stars + background, around all 4 S3 events."""
import warnings; warnings.filterwarnings("ignore")
import json, glob, numpy as np, lightkurve as lk
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
from astropy.coordinates import SkyCoord; import astropy.units as u
from scipy.ndimage import maximum_filter
from measure import measure
RA,DEC=103.92415503464,-67.340521552983
EV={"1385.094":(1385.094,0.125),"1389.59":(1389.59,0.25),"1391.135":(1391.135,0.283),"1394.01":(1394.01,0.2)}
tpf=lk.read(glob.glob("data/tesscut/*s0003*.fits")[0], quality_bitmask="none")
t=tpf.time.value; F=tpf.flux.value.astype(float); q=tpf.quality
fin=np.all(np.isfinite(F),axis=(1,2))&np.isfinite(t)
print("cadences",len(t),"finite",fin.sum(),"t range",np.nanmin(t[fin]),np.nanmax(t[fin]))
for v in np.unique(q[fin]):
    tt=t[fin&(q==v)]; print(" q",v,len(tt),round(tt.min(),3),round(tt.max(),3))
med=np.nanmedian(F[fin&(q==0)],axis=0); sky=med<np.nanpercentile(med,40)
bkg=np.nanmedian(F[:,sky],axis=1); Fb=F-bkg[:,None,None]
xt,yt=[float(v) for v in tpf.wcs.world_to_pixel(SkyCoord(RA*u.deg,DEC*u.deg))]
Y,X=np.mgrid[:25,:25]
def ap(x,y,r): return (X-x)**2+(Y-y)**2<=r**2
lcs={r:np.nansum(Fb[:,ap(xt,yt,r)],axis=1) for r in [1.0,1.5,2.5]}
# comparison stars
medb=np.nanmedian(Fb[fin&(q==0)],axis=0)
pk=(medb==maximum_filter(medb,size=5))&(medb>0.15*medb[int(round(yt)),int(round(xt))])
comps=[(xx,yy) for yy,xx in zip(*np.where(pk)) if np.hypot(xx-xt,yy-yt)>=3 and 2<xx<22 and 2<yy<22]
clc={c:np.nansum(Fb[:,ap(c[0],c[1],1.5)],axis=1) for c in comps}
cx=(Fb[:,int(yt)-2:int(yt)+3,int(xt)-2:int(xt)+3]*X[int(yt)-2:int(yt)+3,int(xt)-2:int(xt)+3]).sum((1,2))/Fb[:,int(yt)-2:int(yt)+3,int(xt)-2:int(xt)+3].sum((1,2))
cy=(Fb[:,int(yt)-2:int(yt)+3,int(xt)-2:int(xt)+3]*Y[int(yt)-2:int(yt)+3,int(xt)-2:int(xt)+3]).sum((1,2))/Fb[:,int(yt)-2:int(yt)+3,int(xt)-2:int(xt)+3].sum((1,2))
res={"target_px":[xt,yt],"comparisons":[[int(a),int(b),float(medb[b,a]/medb[int(round(yt)),int(round(xt))])] for a,b in comps]}
for name,(tc,dur) in EV.items():
    res[name]={}
    for mask_name,good in [("q0",fin&(q==0)),("allfinite",fin)]:
        for r,lc in lcs.items():
            y=lc.copy(); y[~good]=np.nan
            m=measure(t,y,tc,dur,win=1.0,order=2)
            res[name][f"{mask_name}_r{r}"]=None if (m is None or not np.isfinite(m.get("depth",np.nan))) else dict(depth_ppt=round(m["depth"]*1e3,2),sig_ppt=round(m["sig_adopt"]*1e3,2),cov=round(m["cov"],2))
        cd=[]
        for c,lc in clc.items():
            y=lc.copy(); y[~good]=np.nan
            m=measure(t,y,tc,dur,win=1.0,order=2)
            if m is not None and np.isfinite(m.get("depth",np.nan)): cd.append([int(c[0]),int(c[1]),round(m["depth"]*1e3,1),round(m["sig_adopt"]*1e3,1)])
        res[name][f"{mask_name}_comps"]=cd
    w=np.abs(t-tc)<dur/2
    res[name]["bkg_in_event_median"]=float(np.nanmedian(bkg[w&fin])); res[name]["bkg_sector_median"]=float(np.nanmedian(bkg[fin&(q==0)]))
    res[name]["quality_in_event"]=sorted(set(int(v) for v in q[w]))
print(json.dumps(res,indent=1))
json.dump(res,open("data/step2_own_phot_s3.json","w"),indent=1)
np.savez("data/own_phot_s3.npz",t=t,q=q,fin=fin,bkg=bkg,cx=cx,cy=cy,**{f"r{r}":lc for r,lc in lcs.items()},comps=np.array(comps),clc=np.array([clc[c] for c in comps]))
fig,ax=plt.subplots(5,1,figsize=(14,14),sharex=True)
g=fin&(q==0); b=fin&(q!=0)
for i,r in enumerate([1.5,2.5]):
    lc=lcs[r]; n=np.nanmedian(lc[g])
    ax[i].plot(t[g],lc[g]/n,".",ms=2); ax[i].plot(t[b],lc[b]/n,"rx",ms=2); ax[i].set_ylabel(f"own r={r} px"); ax[i].set_ylim(0.9,1.06)
for c,lc in list(clc.items())[:6]:
    n=np.nanmedian(lc[g]); ax[2].plot(t[fin],lc[fin]/n,".",ms=1.5,label=f"comp {c}")
ax[2].set_ylim(0.9,1.06); ax[2].legend(fontsize=6); ax[2].set_ylabel("comparison stars")
ax[3].plot(t[fin],bkg[fin],".",ms=2,color="gray"); ax[3].set_ylabel("bkg e-/s/px"); ax[3].set_yscale("symlog")
ax[4].plot(t[fin],(cx[fin]-np.nanmedian(cx[g]))*21,".",ms=2,label="col"); ax[4].plot(t[fin],(cy[fin]-np.nanmedian(cy[g]))*21,".",ms=2,label="row"); ax[4].set_ylim(-10,10); ax[4].legend(); ax[4].set_ylabel("centroid [\"]")
for a in ax:
    for n_,(tc,d) in EV.items(): a.axvspan(tc-d/2,tc+d/2,color="orange",alpha=.3)
ax[0].set_xlim(1381.5,1400); ax[4].set_xlabel("BTJD")
fig.suptitle("S3 own TESScut photometry (red x = flagged cadences)"); fig.tight_layout(); fig.savefig("figs/own_phot_s3.png",dpi=100)
