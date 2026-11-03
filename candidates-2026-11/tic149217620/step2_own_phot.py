"""Own TESScut photometry: 3 backgrounds x 4 apertures; depth at the event; flux-vs-background regression; injection.
usage: step2_own_phot.py SECTOR TC"""
import warnings; warnings.filterwarnings("ignore")
import glob, json, sys, numpy as np, lightkurve as lk
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
from astropy.stats import sigma_clipped_stats
from measure import measure, trapezoid
from cfg import *
S=int(sys.argv[1]); tc=float(sys.argv[2])
tpf=lk.read(glob.glob(f"data/tesscut/**/tess-s{S:04d}*.fits",recursive=True)[0])
t=tpf.time.value; F=tpf.flux.value.astype(float); q=tpf.quality
fin=np.all(np.isfinite(F),axis=(1,2))
onsi=np.nanmedian(F[fin],0)>1
xt,yt=[float(v) for v in tpf.wcs.world_to_pixel_values(RA,DEC)]
Y,X=np.mgrid[:F.shape[1],:F.shape[2]]; r=np.hypot(X-xt,Y-yt)
med=np.nanmedian(F[fin],0)
print("on-silicon rows:", np.where(onsi.any(1))[0].min(), np.where(onsi.any(1))[0].max(), "target px", round(xt,2), round(yt,2))
bk={}
faint=onsi&(med<np.nanpercentile(med[onsi],30))&(r>3); bk["global faint-30%"]=np.nanmedian(F[:,faint],1)
ann=onsi&(r>4)&(r<8); bk["annulus 4-8 clipped"]=np.array([sigma_clipped_stats(f[ann])[1] for f in F])
A=np.vstack([np.ones(faint.sum()),X[faint],Y[faint]]).T
co=np.linalg.lstsq(A,F[:,faint].T,rcond=None)[0]; bk["plane fit"]=co[0]+co[1]*xt+co[2]*yt
good=(q==0)&fin
out={"sector":S,"tc":tc,"target_px":[xt,yt],"res":{}}
LC={}
for name,b in bk.items():
    for rap in [1.0,1.5,2.0,3.0]:
        ap=(r<=rap)&onsi; lc=np.nansum(F[:,ap]-b[:,None],1); LC[(name,rap)]=lc
        y=lc.copy(); y[~good]=np.nan
        m=measure(t,y,tc,DUR,1.0,2)
        if m is None or not np.isfinite(m.get("depth",np.nan)): continue
        # same with background regressed out (linear in b) over +-1.5 d
        w=np.abs(t-tc)<1.5; w&=np.isfinite(y)
        s=trapezoid(t[w],tc,DUR); Bm=np.vstack([-s,np.ones(w.sum()),t[w]-tc,(t[w]-tc)**2,b[w]/np.nanmedian(y[w])]).T
        yn=y[w]/np.nanmedian(y[w]); cc=np.linalg.lstsq(Bm,yn,rcond=None)[0]
        rr=np.corrcoef(yn-np.polyval(np.polyfit(t[w]-tc,yn,2),t[w]-tc),b[w])[0,1]
        out["res"][f"{name}|r{rap}"]=dict(npix=int(ap.sum()),depth=round(m['depth']*1e3,2),sig=round(m['sig_adopt']*1e3,2),frac_deeper=round(m['frac_deeper'],3),
             depth_bkg_regressed=round(cc[0]*1e3,2),r_flux_bkg=round(rr,2),star_e=round(float(np.nanmedian(lc[good])),1),bkg_e_ap_at_tc=round(float(np.interp(tc,t,b))*ap.sum(),1))
        print(f"{name:20s} r={rap} npix {ap.sum():2d}: {m['depth']*1e3:6.2f} ± {m['sig_adopt']*1e3:5.2f} ppt (fdeeper {m['frac_deeper']:.3f}); bkg-regressed {cc[0]*1e3:6.2f}; r(flux,bkg) {rr:+.2f}; star {np.nanmedian(lc[good]):.0f} e/s, bkg in ap at tc {np.interp(tc,t,b)*ap.sum():.0f} e/s")
# injection of the QLP depth into the default LC
lc=LC[("global faint-30%",1.5)].copy(); lc[~good]=np.nan
m0=measure(t,lc,tc,DUR,1.0,2); li=lc*(1-DEPTH*trapezoid(t,tc+0.5,DUR)); mi=measure(t,li,tc+0.5,DUR,1.0,2); m1=measure(t,lc,tc+0.5,DUR,1.0,2)
out["injection"]=dict(injected=DEPTH*1e3,recovered_minus_native=round((mi['depth']-m1['depth'])*1e3,2)); print("injection +0.5 d:",out["injection"])
w=np.abs(t-tc)<2
fig,ax=plt.subplots(3,1,figsize=(11,9),sharex=True)
for k,key in enumerate([("global faint-30%",1.0),("global faint-30%",1.5),("annulus 4-8 clipped",1.5),("plane fit",2.0),("global faint-30%",3.0)]):
    lc=LC[key]; g=good&w; nr=np.nanmedian(lc[g]); b=max(1,int(round(0.02/np.median(np.diff(t)))))
    yy=(lc[g]/nr-1)*1e3; n=len(yy)//b
    ax[0].plot(t[g][:n*b].reshape(n,b).mean(1),yy[:n*b].reshape(n,b).mean(1)-20*k,'.',ms=3,label=f"{key[0]} r={key[1]}: {out['res'][f'{key[0]}|r{key[1]}']['depth']} ± {out['res'][f'{key[0]}|r{key[1]}']['sig']}")
ax[0].legend(fontsize=7); ax[0].set_ylabel("own phot [ppt], offset")
for name,b in bk.items(): ax[1].plot(t[w],b[w],'.',ms=2,label=name)
ax[1].legend(fontsize=7); ax[1].set_ylabel("bkg e/s/px")
ax[2].plot(t[w],q[w],'.',ms=2); ax[2].set_ylabel("TESScut quality")
for a in ax: a.axvspan(tc-DUR/2,tc+DUR/2,color='orange',alpha=.25)
plt.tight_layout(); plt.savefig(f"figs/own_phot_s{S}.png",dpi=90)
json.dump(out,open(f"data/step2_own_phot_s{S}.json","w"),indent=1,default=float)
