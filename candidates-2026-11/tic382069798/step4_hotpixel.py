"""The stepping pixel: CCD coordinates, full S32 time series vs its neighbours, and its state in S33 (same camera/CCD) if inside the cutout."""
import warnings; warnings.filterwarnings("ignore")
import glob, json, numpy as np, lightkurve as lk
from common import *
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
out={}
tp=lk.read(glob.glob("data/tesscut/**/tess-s0032*.fits",recursive=True)[0])
col,row=tp.column+12,tp.row+10; out["ccd_col_row"]=(int(col),int(row)); print("S32 cutout origin",tp.column,tp.row,"-> stepping pixel CCD col,row",col,row, "cam/ccd",tp.camera,tp.ccd)
t=tp.time.value; F=tp.flux.value.astype(float); q=tp.quality; ok=np.all(np.isfinite(F),axis=(1,2))&(q==0)
p=F[ok,10,12]; nb=np.median(np.stack([F[ok,10,11],F[ok,11,12],F[ok,9,12],F[ok,10,13]]),0); tt=t[ok]
fig,ax=plt.subplots(2,1,figsize=(13,7))
k=max(int(round((1/24)/np.median(np.diff(tt)))),1); n=len(tt)//k
ax[0].plot(tt[:n*k].reshape(n,k).mean(1),p[:n*k].reshape(n,k).mean(1),'.',ms=3,label="pixel (12,10)")
ax[0].plot(tt[:n*k].reshape(n,k).mean(1),nb[:n*k].reshape(n,k).mean(1),'.',ms=3,label="median of its 4 neighbours")
ax[0].axvline(2190.358,color='r',lw=.5); ax[0].legend(); ax[0].set_title("S32 TESScut, 1 h bins (e/s)")
ratio=p/nb; lv={}
for a,b in [(2174,2180),(2180,2185.5),(2187.2,2190.35),(2190.36,2193),(2193,2196.5),(2196.5,2200.5)]:
    m=(tt>a)&(tt<b); lv[f"{a}-{b}"]=dict(pix=round(float(np.median(p[m])),2),nbr=round(float(np.median(nb[m])),2),ratio=round(float(np.median(ratio[m])),4))
out["S32 levels"]=lv; print(json.dumps(lv,indent=0))
# per-cadence around the step
w=np.abs(tt-2190.358)<0.04
for a,b,c in zip(tt[w],p[w],nb[w]): print(round(a,4),round(b,1),round(c,1))
for s in [31,33]:
    f=glob.glob(f"data/tesscut/**/tess-s00{s}*.fits",recursive=True)[0]; tq=lk.read(f)
    c0,r0=tq.column,tq.row; i,j=col-c0,row-r0; print(f"S{s}: cam/ccd {tq.camera}/{tq.ccd}, origin {c0},{r0} -> pixel index ({i},{j})")
    if tq.camera==tp.camera and tq.ccd==tp.ccd and 0<i<tq.shape[2]-1 and 0<j<tq.shape[1]-1:
        Fq=tq.flux.value.astype(float); okq=np.all(np.isfinite(Fq),axis=(1,2))&(tq.quality==0)
        pp=Fq[okq,j,i]; nn=np.median(np.stack([Fq[okq,j,i-1],Fq[okq,j+1,i],Fq[okq,j-1,i],Fq[okq,j,i+1]]),0)
        bk=np.median(Fq[okq],axis=(1,2))
        out[f"S{s}"]=dict(pix_median=float(np.median(pp)),nbr_median=float(np.median(nn)),bkg_median=float(np.median(bk)),pix_minus_nbr=float(np.median(pp-nn)))
        print(f"S{s}", out[f"S{s}"])
        tq_=tq.time.value[okq]; ax[1].plot(tq_,pp,'.',ms=1,label=f"S{s} same CCD pixel"); ax[1].plot(tq_,nn,'.',ms=1,label=f"S{s} its neighbours")
    else: out[f"S{s}"]="different CCD or outside cutout"; print(out[f"S{s}"])
ax[1].legend(); plt.tight_layout(); plt.savefig("figs/step4_hotpixel.png",dpi=95)
json.dump(out,open("data/step4_hotpixel.json","w"),indent=1,default=str)
