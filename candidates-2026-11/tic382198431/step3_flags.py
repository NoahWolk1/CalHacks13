"""Systematics around each event: quality flags, momentum dumps (bit 32), gaps, QLP background level and slope,
TESS-SPOC centroids if present, and TESScut flux-weighted centroid jitter. Usage: step3_flags.py"""
import warnings, json, glob; warnings.filterwarnings("ignore")
import numpy as np, lightkurve as lk, collections
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
from astropy.coordinates import SkyCoord; import astropy.units as u
from lcio import load_all
from common import EVENTS, RA, DEC
L=load_all(); out={}
for name,tc,dur in EVENTS:
    for r in L:
        t=r["t"]
        if not (np.nanmin(t)-0.2<tc<np.nanmax(t)+0.2): continue
        q=r["q"]; w=np.abs(t-tc)<1.0; ev=np.abs(t-tc)<dur/2
        tt=t[np.isfinite(t)]; gaps=[(round(a,3),round(b,3)) for a,b in zip(tt[:-1],tt[1:]) if b-a>0.1]
        dumps=t[(q&32)>0]; 
        o=dict(sector=r["sector"],cam=r["camera"],ccd=r["ccd"],
               flags_in_event=dict(collections.Counter(q[ev].tolist())),flags_pm1d=dict(collections.Counter(q[w].tolist())),
               nearest_dump_d=round(float(np.min(np.abs(dumps-tc))),3) if len(dumps) else None,
               gaps=[g for g in gaps if abs(g[0]-tc)<3 or abs(g[1]-tc)<3],
               nearest_flagged_d=round(float(np.min(np.abs(t[q!=0]-tc))),3) if (q!=0).any() else None,
               sector_span=[round(float(np.nanmin(t)),2),round(float(np.nanmax(t)),2)])
        if "SAP_BKG" in r:
            b=r["SAP_BKG"]; o["bkg_in_event"]=[round(float(np.nanmin(b[ev])),1),round(float(np.nanmax(b[ev])),1)] if ev.any() else None
            o["bkg_pm1d_pct"]=[round(float(np.nanpercentile(b[w],5)),1),round(float(np.nanpercentile(b[w],95)),1)]
            o["bkg_sector_median"]=round(float(np.nanmedian(b)),1)
        for c1,c2 in [("MOM_CENTR1","MOM_CENTR2"),("SAP_X","SAP_Y")]:
            if c1 in r:
                x=r[c1]; y=r[c2]; g=np.isfinite(x)&np.isfinite(y)&w
                if g.sum()>20:
                    oot=g&~ev; inn=g&ev
                    o[f"{c1}_shift_mpx"]=[round(1e3*float(np.nanmedian(x[inn])-np.nanmedian(x[oot])),2),round(1e3*float(np.nanmedian(y[inn])-np.nanmedian(y[oot])),2)] if inn.any() else None
                    o[f"{c1}_std_in_over_out"]=round(float(np.nanstd(x[inn])/np.nanstd(x[oot])),2) if inn.sum()>3 else None
        out[f"{name}_{r['author']}_S{r['sector']}"]=o; print(name,r["author"],o,flush=True)
    # TESScut centroid jitter
    for f in glob.glob("data/tesscut/**/*.fits",recursive=True):
        tpf=lk.read(f,quality_bitmask="none"); t=tpf.time.value
        if not (t.min()<tc<t.max()): continue
        F=tpf.flux.value; xt,yt=[float(v) for v in tpf.wcs.world_to_pixel(SkyCoord(RA*u.deg,DEC*u.deg))]
        Y,X=np.mgrid[:F.shape[1],:F.shape[2]]; m=np.hypot(X-xt,Y-yt)<=2.0
        Fb=F-np.nanmedian(F.reshape(len(t),-1),axis=1)[:,None,None]*0  # no bkg change: centroid of raw
        bk=np.nanmedian(np.where(np.hypot(X-xt,Y-yt)>5,F,np.nan).reshape(len(t),-1),axis=1)
        Fs=F-bk[:,None,None]
        fs=np.nansum(np.where(m,Fs,0),axis=(1,2)); cx=np.nansum(np.where(m,Fs*X,0),axis=(1,2))/fs; cy=np.nansum(np.where(m,Fs*Y,0),axis=(1,2))/fs
        w=np.abs(t-tc)<1; ev=np.abs(t-tc)<dur/2
        def jit(a,sel):
            b=np.arange(tc-1,tc+1,1/24); i=np.digitize(t[sel],b); s=[np.nanstd(a[sel][i==k]) for k in range(1,len(b)) if (i==k).sum()>3]; return np.nanmedian(s)
        o=dict(file=f.split("/")[-1],centroid_shift_mpx=[round(1e3*float(np.nanmedian(cx[ev])-np.nanmedian(cx[w&~ev])),1),round(1e3*float(np.nanmedian(cy[ev])-np.nanmedian(cy[w&~ev])),1)],
               jitter_in_over_out=round(float(jit(cx,ev&w)/jit(cx,w&~ev)),2))
        out[f"{name}_tesscut"]=o; print(name,"TESScut",o)
        fig,ax=plt.subplots(3,1,figsize=(9,7),sharex=True)
        ax[0].plot(t[w]-tc,bk[w],".",ms=2); ax[0].set_ylabel("sky e/s/px")
        ax[1].plot(t[w]-tc,(cx[w]-np.nanmedian(cx[w]))*1e3,".",ms=2,label="x"); ax[1].plot(t[w]-tc,(cy[w]-np.nanmedian(cy[w]))*1e3,".",ms=2,label="y"); ax[1].set_ylabel("centroid mpx"); ax[1].legend()
        ax[2].plot(t[w]-tc,(fs[w]/np.nanmedian(fs[w])-1)*1e3,".",ms=2); ax[2].set_ylabel("r=2 flux ppt")
        for a in ax: a.axvspan(-dur/2,dur/2,alpha=.15,color="orange")
        ax[2].set_xlabel(f"days from {tc}"); fig.tight_layout(); fig.savefig(f"figs/step3_flags_{name}.png",dpi=80)
json.dump(out,open("data/step3_flags.json","w"),indent=1,default=str)
