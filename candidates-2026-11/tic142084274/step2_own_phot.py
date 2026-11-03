"""Own TESScut aperture photometry for S12, several backgrounds x apertures, comparison stars, injection."""
import warnings; warnings.filterwarnings("ignore")
import glob, json, numpy as np, lightkurve as lk
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
from astropy.coordinates import SkyCoord; import astropy.units as u
from astropy.stats import sigma_clipped_stats
from scipy.ndimage import maximum_filter
from measure import measure, trapezoid
RA,DEC=98.12203,-74.85380; TC=1635.158; DUR=2/24
tpf=lk.read(glob.glob("data/tesscut/tess-s0012*.fits")[0])
t=tpf.time.value; F=tpf.flux.value.astype(float); q=tpf.quality
print("TESScut quality values:",{int(v):int((q==v).sum()) for v in np.unique(q)})
fin=np.all(np.isfinite(F),axis=(1,2))
onsi=np.nanmedian(F[fin],0)>10   # off-silicon / virtual columns read ~0
xt,yt=[float(v) for v in tpf.wcs.world_to_pixel(SkyCoord(RA*u.deg,DEC*u.deg))]
print("target px",xt,yt,"on-silicon columns:",np.where(onsi.any(0))[0])
Y,X=np.mgrid[:F.shape[1],:F.shape[2]]; r=np.hypot(X-xt,Y-yt)
med=np.nanmedian(F[fin],0)
faint=onsi&(med<np.nanpercentile(med[onsi],40))&(r>3)
bk={}
bk["global faint-40%"]=np.nanmedian(F[:,faint],1)
ann=onsi&(r>4)&(r<8)
bk["annulus 4-8px clipped"]=np.array([sigma_clipped_stats(f[ann])[1] for f in F])
bk["annulus 4-8px 25th pct"]=np.nanpercentile(F[:,ann],25,axis=1)
A=np.vstack([np.ones(faint.sum()),X[faint],Y[faint]]).T
co=np.linalg.lstsq(A,F[:,faint].T,rcond=None)[0]; bk["plane fit"]=co[0]+co[1]*xt+co[2]*yt
out={"target_px":[xt,yt],"bkg_methods":{}}
good0=(q==0)&fin
LC={}
for name,b in bk.items():
    for rap in [1.0,1.5,2.5]:
        ap=(r<=rap)&onsi
        lc=np.nansum(F[:,ap]-b[:,None],1)
        for qm,gm in [("q==0",good0),("all finite",fin)]:
            y=lc.copy(); y[~gm]=np.nan
            m=measure(t,y,TC,DUR,1.0,1)
            if m is None or not np.isfinite(m.get("depth",np.nan)): out["bkg_methods"][f"{name}, r={rap}, {qm}"]=None; continue
            out["bkg_methods"][f"{name}, r={rap}, {qm}"]=dict(depth=round(m['depth']*1e3,2),sig=round(m['sig_adopt']*1e3,2),
                 white=round(m['sig_white']*1e3,2),emp=round(m['sig_emp']*1e3,2),cov=round(m['cov'],2),frac_deeper=round(m['frac_deeper'],3),npix=int(ap.sum()))
            print(f"{name:24s} r={rap} {qm:10s} npix={ap.sum():2d} depth {m['depth']*1e3:6.2f} +- {m['sig_adopt']*1e3:5.2f} ppt (white {m['sig_white']*1e3:.2f}, emp {m['sig_emp']*1e3:.2f}) cov {m['cov']:.2f} fdeeper {m['frac_deeper']:.3f}")
        LC[(name,rap)]=lc
# background / star ratio in r=1.5
ap=(r<=1.5)&onsi; star=np.nanmedian(np.nansum(F[good0][:,ap]-bk["global faint-40%"][good0][:,None],1))
out["bkg_over_star_r1.5"]=float(np.nanmedian(bk["global faint-40%"][good0])*ap.sum()/star); out["star_flux_r1.5"]=float(star)
print("star flux r1.5 e/s",star,"bkg/star",out["bkg_over_star_r1.5"])
# per cadence around event
lc=LC[("global faint-40%",1.5)]; nrm=np.nanmedian(lc[good0&(np.abs(t-TC)<1)])
print("cadence table (own r=1.5, ppt; bkg e/s/px; quality)")
for i in np.where(np.abs(t-TC)<0.2)[0]:
    print(f" {t[i]:.4f} q={q[i]:5d} flux {(lc[i]/nrm-1)*1e3:7.1f}  bkg {bk['global faint-40%'][i]:7.2f}")
# injection of 22 ppt, 2 h
inj={}
for name in ["global faint-40%","annulus 4-8px clipped"]:
    lc=LC[(name,1.5)].copy(); lc[~fin]=np.nan
    m0=measure(t,lc,TC,DUR,1.0,1)
    for dt in [0,-0.02,0.02]:
        li=lc*(1-0.022*trapezoid(t,TC+dt,DUR)); m=measure(t,li,TC,DUR,1.0,1)
        inj[f"{name} dt={dt}"]=dict(rec=round(m['depth']*1e3,2),sig=round(m['sig_adopt']*1e3,2),minus_native=round((m['depth']-m0['depth'])*1e3,2))
        print("inject 22 ppt",name,dt,inj[f"{name} dt={dt}"])
out["injection_22ppt"]=inj
# comparison stars in cutout
medb=med-np.nanmedian(bk["global faint-40%"][fin])
pk=(medb==maximum_filter(medb,size=5))&(medb>60)&onsi
comps=[]
b=bk["global faint-40%"]
for yy,xx in zip(*np.where(pk)):
    if np.hypot(xx-xt,yy-yt)<3: continue
    ap=(np.hypot(X-xx,Y-yy)<=1.5)&onsi
    lc=np.nansum(F[:,ap]-b[:,None],1); y=lc.copy(); y[~fin]=np.nan
    m=measure(t,y,TC,DUR,1.0,1)
    if m is None or not np.isfinite(m.get("depth",np.nan)): continue
    comps.append(dict(x=int(xx),y=int(yy),peak=float(medb[yy,xx]),depth=round(m['depth']*1e3,2),sig=round(m['sig_adopt']*1e3,2),lc=y))
    print("comp",xx,yy,round(medb[yy,xx]),comps[-1]["depth"],comps[-1]["sig"])
out["comparison_stars"]=[{k:v for k,v in c.items() if k!="lc"} for c in comps]
# figure
w=np.abs(t-TC)<1.5
fig,ax=plt.subplots(3,1,figsize=(11,9),sharex=True)
for k,(name,rap) in enumerate([("global faint-40%",1.5),("annulus 4-8px clipped",1.5),("global faint-40%",2.5)]):
    lc=LC[(name,rap)]; g=fin&w; nr=np.nanmedian(lc[g])
    ax[0].plot(t[g],(lc[g]/nr-1)*1e3-25*k,'.',ms=3,label=f"{name}, r={rap}: {out['bkg_methods'][f'{name}, r={rap}, all finite']['depth']:.1f} ± {out['bkg_methods'][f'{name}, r={rap}, all finite']['sig']:.1f} ppt")
ax[0].legend(fontsize=7); ax[0].set_ylabel("own phot [ppt] (offset)")
for c in comps[:6]:
    g=np.isfinite(c["lc"])&w; ax[1].plot(t[g],(c["lc"][g]/np.nanmedian(c["lc"][g])-1)*1e3,'.',ms=2,label=f"comp ({c['x']},{c['y']}) {c['depth']}±{c['sig']}")
ax[1].legend(fontsize=6,ncol=2); ax[1].set_ylim(-40,40); ax[1].set_ylabel("comparisons [ppt]")
ax[2].plot(t[w],bk["global faint-40%"][w],'.',ms=2,color='gray'); ax[2].plot(t[w&(q!=0)],bk["global faint-40%"][w&(q!=0)],'rx',ms=3,label='flagged')
ax[2].set_ylabel("bkg e/s/px"); ax[2].legend(fontsize=7); ax[2].set_xlabel("BTJD")
for a in ax: a.axvspan(TC-DUR/2,TC+DUR/2,color='orange',alpha=.25)
fig.suptitle("S12 own TESScut photometry (target is 3-4 px from the CCD edge)"); fig.tight_layout(); fig.savefig("figs/own_phot_s12.png",dpi=110)
json.dump(out,open("data/step2_own_phot.json","w"),indent=1,default=float)
