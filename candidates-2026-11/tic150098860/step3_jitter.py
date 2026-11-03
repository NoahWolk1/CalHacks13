"""Does the S4 dip track post-dump pointing jitter? Proxy: centroid excursion^2 from a 0.5-d running median."""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, json, matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
from scipy.ndimage import median_filter
from lcio import load_all
from measure import trapezoid, segments
r=[x for x in load_all() if x["sector"]==4 and x["author"]=="SPOC"][0]
t=r["t"]; q=r["q"]; tc=1417.097; dur=0.333
fin=np.isfinite(t)&np.isfinite(r['SAP_FLUX'])&np.isfinite(r['MOM_CENTR1'])
w=fin&(np.abs(t-tc)<1.0)&(t<1418.5)
out={}
# per 1h bin jitter (std of centroid incl. all cadences, flagged too) vs mean flux (q==0)
bins=np.arange(tc-1,tc+1.0001,1/24)
c1=r['MOM_CENTR1']; c2=r['MOM_CENTR2']
rows=[]
for a in bins[:-1]:
    m=w&(t>=a)&(t<a+1/24)
    mg=m&(q==0)
    if mg.sum()<5: continue
    jit=np.hypot(np.std(c1[m]),np.std(c2[m]))
    jitg=np.hypot(np.std(c1[mg]),np.std(c2[mg]))
    rows.append((a+1/48,jit,jitg,np.mean(r['SAP_FLUX'][mg]),np.mean(r['PDCSAP_FLUX'][mg]),((q[m]&128)>0).mean()))
rows=np.array(rows)
sap=rows[:,3]/np.median(rows[:,3]); pdc=rows[:,4]/np.median(rows[:,4])
for i,n in [(1,"jitter all cadences"),(2,"jitter q=0 cadences"),(5,"excluded fraction")]:
    for nm,y in [("SAP",sap),("PDC",pdc)]:
        cc=np.corrcoef(rows[:,i],y)[0,1]; out[f"r_{nm}_{n}"]=cc; print(f"corr({nm} flux, {n}) = {cc:.2f}")
# regression on q==0 cadences: baseline(quad per segment) + a*jitter_proxy  vs  + depth*box
g=w&(q==0)
tt=t[g]; f=r['SAP_FLUX'][g]/np.nanmedian(r['SAP_FLUX'][g])
# jitter proxy per cadence: running std (15 cadences=30min) of all-cadence centroid, interpolated
def runstd(x,n=15):
    from numpy.lib.stride_tricks import sliding_window_view as sw
    s=np.full(len(x),np.nan); v=sw(x,n).std(1); s[n//2:n//2+len(v)]=v; return s
ia=np.where(w)[0]
j=np.hypot(runstd(c1[ia]),runstd(c2[ia])); jp=np.interp(tt,t[ia],np.nan_to_num(j,nan=np.nanmedian(j)))
s=trapezoid(tt,tc,dur)
def design(extra):
    cols=list(extra)
    for idx in segments(tt):
        for k in range(3):
            c=np.zeros_like(tt); c[idx]=(tt[idx]-tc)**k; cols.append(c)
    return np.vstack(cols).T
for lab,ex in [("box only",[-s]),("jitter only",[jp]),("box+jitter",[-s,jp])]:
    A=design(ex); coef,*_=np.linalg.lstsq(A,f,rcond=None); res=f-A@coef; chi=np.sum(res**2)
    covm=np.linalg.pinv(A.T@A)*np.var(res)
    print(f"{lab:12s} chi2*1e6={chi*1e6:.3f}  coefs={np.round(coef[:len(ex)]*1e3,3)} err={np.round(np.sqrt(np.diag(covm))[:len(ex)]*1e3,3)} BIC={len(tt)*np.log(chi/len(tt))+A.shape[1]*np.log(len(tt)):.1f}")
    out[lab]=dict(coef_ppt=(coef[:len(ex)]*1e3).tolist(),err=(np.sqrt(np.diag(covm))[:len(ex)]*1e3).tolist(),BIC=float(len(tt)*np.log(chi/len(tt))+A.shape[1]*np.log(len(tt))))
json.dump(out,open("data/step3_jitter.json","w"),indent=1)
fig,ax=plt.subplots(2,1,figsize=(10,6),sharex=True)
ax[0].plot(rows[:,0],(sap-1)*1e3,'k.-',label='SAP (q=0) 1h bins'); ax[0].plot(rows[:,0],(pdc-1)*1e3,'c.-',label='PDCSAP'); ax[0].legend(); ax[0].set_ylabel('ppt')
ax[1].plot(rows[:,0],rows[:,1]*1e3,'r.-',label='centroid jitter, all cadences'); ax[1].plot(rows[:,0],rows[:,2]*1e3,'m.-',label='jitter, q=0'); ax[1].set_ylabel('mpx'); ax[1].legend()
for a in ax: a.axvline(1416.936,color='b'); a.axvspan(tc-dur/2,tc+dur/2,color='g',alpha=.15)
plt.savefig("figs/step3_jitter_S4.png",dpi=100)
