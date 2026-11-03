"""Focus on 1385.094: local-annulus photometry, comps, centroid jitter, TASOC, QLP; empirical significance within the pre-science segment."""
import warnings; warnings.filterwarnings("ignore")
import json, glob, numpy as np, lightkurve as lk
from astropy.io import fits
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
from astropy.coordinates import SkyCoord; import astropy.units as u
from measure import measure, fit_depth
from lcio import load_all
RA,DEC=103.92415503464,-67.340521552983
TC,DUR=1385.094,0.125
tpf=lk.read(glob.glob("data/tesscut/*s0003*.fits")[0], quality_bitmask="none")
t=tpf.time.value; F=tpf.flux.value.astype(float); q=tpf.quality
xt,yt=[float(v) for v in tpf.wcs.world_to_pixel(SkyCoord(RA*u.deg,DEC*u.deg))]
Y,X=np.mgrid[:25,:25]
def phot(x,y,r,rin=4,rout=7):
    a=(X-x)**2+(Y-y)**2<=r**2; an=((X-x)**2+(Y-y)**2>=rin**2)&((X-x)**2+(Y-y)**2<=rout**2)
    b=np.nanpercentile(F[:,an],30,axis=1)
    return np.nansum(F[:,a],axis=1)-b*a.sum(), b
out={}
lc15,b15=phot(xt,yt,1.5); lc25,_=phot(xt,yt,2.5)
comps=[(5,7),(11,8),(5,12),(9,20)]
# per-cadence centroid
sl=(slice(int(round(yt))-2,int(round(yt))+3),slice(int(round(xt))-2,int(round(xt))+3))
st=F[:,sl[0],sl[1]]-b15[:,None,None]; cx=(st*X[sl]).sum((1,2))/st.sum((1,2)); cy=(st*Y[sl]).sum((1,2))/st.sum((1,2))
seg_pre=(t>1384.3)&(t<1385.9); seg_sci=(t>1386)&(t<1388)
out["centroid_rms_arcsec_pre_1384.3_1385.9"]=[float(np.nanstd(cx[seg_pre])*21),float(np.nanstd(cy[seg_pre])*21)]
out["centroid_rms_arcsec_sci_1386_1388"]=[float(np.nanstd(cx[seg_sci])*21),float(np.nanstd(cy[seg_sci])*21)]
for nm,lc in [("own_r1.5_annulus",lc15),("own_r2.5_annulus",lc25)]+[(f"comp{c}_r1.5",phot(c[0],c[1],1.5)[0]) for c in comps]:
    f=lc/np.nanmedian(lc[seg_pre])
    m=measure(t,f,TC,DUR,win=0.75,order=1)
    rms_pre=np.nanstd(f[seg_pre]); rms_sci=np.nanstd(np.diff(f[seg_sci]))/np.sqrt(2)
    # empirical: slide within the pre-science segment only (1384.35-1385.85)
    ds=[]
    for tc in np.arange(1384.45,1385.80,0.02):
        if abs(tc-TC)<0.1: continue
        r=fit_depth(t[seg_pre],f[seg_pre],tc,DUR,win=0.75,order=1,min_cov=0.8)
        if r is not None and np.isfinite(r.get("depth",np.nan)): ds.append(r["depth"])
    ds=np.array(ds)
    out[nm]=dict(depth_ppt=round(m["depth"]*1e3,2),sig_adopt_ppt=round(m["sig_adopt"]*1e3,2),pt_rms_pre_ppt=round(rms_pre*1e3,2),pt_rms_sci_ppt=round(rms_sci*1e3,2),
                 slid_in_preseg_n=len(ds),slid_std_ppt=round(1.4826*np.median(np.abs(ds-np.median(ds)))*1e3,2) if len(ds) else None,
                 slid_max_ppt=round(ds.max()*1e3,2) if len(ds) else None, frac_slid_deeper=float((ds>=m["depth"]).mean()) if len(ds) else None)
# QLP
r=[r for r in load_all() if r["sector"]==3 and r["author"]=="QLP"][0]
for col in ["SAP_FLUX","KSPSAP_FLUX"]:
    f=r[col].copy(); m=measure(r["t"],f,TC,DUR,win=0.75,order=1)
    out["QLP_"+col+"_allcad"]=dict(depth_ppt=round(m["depth"]*1e3,2),sig_adopt_ppt=round(m["sig_adopt"]*1e3,2))
    f2=f.copy(); f2[r["q"]!=0]=np.nan; m=measure(r["t"],f2,TC,DUR,win=0.75,order=1)
    out["QLP_"+col+"_q0"]=None if m is None or not np.isfinite(m.get("depth",np.nan)) else dict(depth_ppt=round(m["depth"]*1e3,2),sig_adopt_ppt=round(m["sig_adopt"]*1e3,2),cov=round(m["cov"],2))
w=np.abs(r["t"]-TC)<0.3
out["QLP_cadences_1384.8_1385.4"]=[[round(a,3),int(b),round(c,4),round(d,1)] for a,b,c,d in zip(r["t"][w],r["q"][w],r["KSPSAP_FLUX"][w],r["SAP_BKG"][w])]
# TASOC
tas=glob.glob("data/lc_other/**/*tasoc*cbv-lc.fits",recursive=True)[0]
d=fits.open(tas)[1].data
tt=np.array(d["TIME"],float); fr=np.array(d["FLUX_RAW"],float); fb=np.array(d["FLUX_BKG"],float); tq=np.array(d["QUALITY"],int)
m=measure(tt,fr,TC,DUR,win=0.75,order=1)
out["TASOC_FLUX_RAW"]=None if m is None or not np.isfinite(m.get("depth",np.nan)) else dict(depth_ppt=round(m["depth"]*1e3,2),sig_adopt_ppt=round(m["sig_adopt"]*1e3,2),cov=round(m["cov"],2))
ww=np.abs(tt-TC)<0.3
out["TASOC_quality_near"]=sorted(set(int(v) for v in tq[ww]))
print(json.dumps(out,indent=1)); json.dump(out,open("data/step2_ev1385.json","w"),indent=1)
fig,ax=plt.subplots(5,1,figsize=(11,12),sharex=True)
w=(t>1383.8)&(t<1386.6)
for lc,lab,off in [(lc15,"own r=1.5 annulus bkg",0),(lc25,"own r=2.5",-15)]:
    n=np.nanmedian(lc[seg_pre]); ax[0].plot(t[w],(lc[w]/n-1)*1e3+off,".",ms=3,label=lab)
ax[0].legend(fontsize=7); ax[0].set_ylabel("ppt"); ax[0].set_ylim(-60,30)
qq=r["q"]; rt=r["t"]; rw=(rt>1383.8)&(rt<1386.6)
ax[1].plot(rt[rw&(qq==0)],r["KSPSAP_FLUX"][rw&(qq==0)],"k.",ms=3,label="QLP KSPSAP q=0"); ax[1].plot(rt[rw&(qq!=0)],r["KSPSAP_FLUX"][rw&(qq!=0)],"rx",ms=3,label="flagged"); ax[1].legend(fontsize=7); ax[1].set_ylim(0.95,1.03)
ax2=ax[2]; ax2.plot(rt[rw],r["SAP_BKG"][rw],".",ms=3,color="gray"); ax2.set_ylabel("QLP SAP_BKG")
tw=(tt>1383.8)&(tt<1386.6); ax[3].plot(tt[tw],fr[tw]/np.nanmedian(fr[tw]),".",ms=3,label="TASOC FLUX_RAW"); ax[3].legend(fontsize=7); ax[3].set_ylim(0.95,1.03)
ax[4].plot(t[w],(cx[w]-np.nanmedian(cx[seg_sci]))*21,".",ms=3,label="col"); ax[4].plot(t[w],(cy[w]-np.nanmedian(cy[seg_sci]))*21,".",ms=3,label="row"); ax[4].set_ylim(-6,6); ax[4].legend(fontsize=7); ax[4].set_ylabel("centroid [\"]")
for a in ax: a.axvspan(TC-DUR/2,TC+DUR/2,color="orange",alpha=.3); a.axvline(1385.95,color="g",ls="--")
ax[4].set_xlabel("BTJD (green dashed: start of S3 science data / SPOC & eleanor coverage)")
fig.suptitle("BTJD 1385.094 in S3 pre-science (pointing-test) data"); fig.tight_layout(); fig.savefig("figs/ev1385_zoom.png",dpi=110)
