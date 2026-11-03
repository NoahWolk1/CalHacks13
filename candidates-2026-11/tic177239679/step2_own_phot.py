"""Own TESScut photometry, S65 and S95: 3 apertures x 2 backgrounds; depth with local quadratic (raw) and after the harmonic model;
amplitude of the 2.374 d signal per aperture (it should scale like the dip if both come from the same blended pair)."""
import warnings; warnings.filterwarnings("ignore")
import glob, json, numpy as np, lightkurve as lk
from astropy.coordinates import SkyCoord; import astropy.units as u
from astropy.stats import sigma_clipped_stats
from measure import measure
from common import *
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
out={}
fig,axs=plt.subplots(2,1,figsize=(12,8))
for k,(sec,tc) in enumerate([(65,TC1),(95,TC2)]):
    tpf=lk.read(glob.glob(f"data/tesscut/**/tess-s00{sec}*.fits",recursive=True)[0])
    t=tpf.time.value; F=tpf.flux.value.astype(float); q=tpf.quality
    fin=np.all(np.isfinite(F),axis=(1,2))&(q==0)
    xt,yt=[float(v) for v in tpf.wcs.world_to_pixel(SkyCoord(RA*u.deg,DEC*u.deg))]
    Y,X=np.mgrid[:F.shape[1],:F.shape[2]]; r=np.hypot(X-xt,Y-yt)
    med=np.nanmedian(F[fin],0)
    faint=(med<np.nanpercentile(med,40))&(r>4)
    bk={"global faint-40%":np.nanmedian(F[:,faint],1),"annulus 5-9px clipped":np.array([sigma_clipped_stats(f[(r>5)&(r<9)])[1] for f in F])}
    for bn,b in bk.items():
        for rap in [1.0,1.8,3.0]:
            ap=r<=rap; lc=np.nansum(F[:,ap]-b[:,None],1); lc[~fin]=np.nan
            g=np.isfinite(lc); y=lc/np.nanmedian(lc)
            res_raw=measure(t,y,tc,DUR,1.0,2)
            yy=y.copy(); m=g&(np.abs(t-tc)>0.4); mdl=harm_fit(t[g],y[g],m[g]); yy[g]=y[g]/mdl
            res=measure(t,yy,tc,DUR,1.0,2)
            # amplitude of SB1 signal: fit only the P harmonics after removing 4.42
            A=harm_design(t[g],((PB,3),(4.42,2))); c=np.linalg.lstsq(A,y[g],rcond=None)[0]
            nseg=A.shape[1]-10; sb=A[:,nseg:nseg+6]@c[nseg:nseg+6]; amp=(sb.max()-sb.min())*1e3
            key=f"S{sec} {bn} r={rap}"
            out[key]=dict(npix=int(ap.sum()),raw=round(res_raw["depth"]*1e3,2),raw_sig=round(res_raw["sig_adopt"]*1e3,2),
                          resid=round(res["depth"]*1e3,2),resid_sig=round(res["sig_adopt"]*1e3,2),resid_fdeeper=round(res["frac_deeper"],3),sb1_p2p_ppt=round(amp,2))
            print(key,out[key])
            if bn.startswith("global") and rap==1.8:
                w=np.abs(t-tc)<2.5
                axs[k].plot(t[w],(y[w]-1)*1e3,',',color='0.6'); 
                n=len(t[w])//18; tb=t[w][:n*18].reshape(n,18).mean(1)
                axs[k].plot(tb,(np.nanmean(y[w][:n*18].reshape(n,18),1)-1)*1e3,'k.',ms=3,label=f"own r=1.8 px: raw {out[key]['raw']}±{out[key]['raw_sig']}")
                axs[k].plot(t[w&g],(np.interp(t[w&g],t[g],mdl)-1)*1e3,'r-',label="harmonic model")
                axs[k].plot(tb,(np.nanmean(yy[w][:n*18].reshape(n,18),1)-1)*1e3-5,'b.',ms=3,label=f"residual-5: {out[key]['resid']}±{out[key]['resid_sig']}")
                axs[k].axvspan(tc-DUR/2,tc+DUR/2,color='orange',alpha=.2); axs[k].legend(fontsize=7); axs[k].set_title(f"S{sec} own TESScut photometry"); axs[k].set_ylim(-9,4)
axs[1].set_xlabel("BTJD"); plt.tight_layout(); plt.savefig("figs/own_phot.png",dpi=110)
json.dump(out,open("data/step2_own_phot.json","w"),indent=1)
