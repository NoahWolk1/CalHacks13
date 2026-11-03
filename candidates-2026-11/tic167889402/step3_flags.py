import warnings; warnings.filterwarnings("ignore")
import numpy as np, matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
from lcio import load_all
from common import TC, DUR
r=[x for x in load_all() if x["sector"]==96 and x["author"]=="SPOC"][0]
t=r["t"]; q=r["q"]; w=3; m=np.abs(t-TC)<w
print(f"S96 cam{r['camera']} ccd{r['ccd']}")
for b in range(0,31):
    bit=1<<b; mm=m&((q&bit)>0)
    if mm.sum():
        tt=t[mm]; print(f" bit {bit}: n={mm.sum()}", np.round(tt[np.r_[True,np.diff(tt)>0.01]],3)[:12])
inb=np.abs(t-TC)<DUR/2
print(" in-box cadences:",inb.sum()," flagged:",(inb&(q!=0)).sum(), "flag values",np.unique(q[inb&(q!=0)]))
fin=np.isfinite(t)
for g in np.where(np.diff(t[fin])>0.02)[0]:
    a,b=t[fin][g],t[fin][g+1]
    if abs(a-TC)<5: print(f" gap {a:.3f}-{b:.3f}")
dumps=t[(q&32)>0]; print(" momentum dumps in sector:",np.round(dumps[np.r_[True,np.diff(dumps)>0.05]],3))
g=(q==0)
# jitter: 1h-binned centroid std in box vs +-2 d
c1=r['MOM_CENTR1'];c2=r['MOM_CENTR2']
def jit(sel):
    tb=np.arange(t[sel].min(),t[sel].max(),1/24); s=[]
    for a in tb:
        k=sel&(t>=a)&(t<a+1/24)
        if k.sum()>10: s.append(np.hypot(np.nanstd(c1[k]),np.nanstd(c2[k])))
    return np.median(s)
ji=jit(g&inb); jo=jit(g&(np.abs(t-TC)<2)&~inb)
print(f" jitter in box {ji*1e3:.2f} mpx vs out {jo*1e3:.2f} mpx, ratio {ji/jo:.2f}")
bk=r['SAP_BKG']; print(f" SAP_BKG in box {np.nanmedian(bk[g&inb]):.1f} vs +-1.5 d {np.nanmedian(bk[g&(np.abs(t-TC)<1.5)&~inb]):.1f} e/s; sector median {np.nanmedian(bk[g]):.1f}")
# centroid shift in box after removing local linear trend
for nm,c in [("col",c1),("row",c2)]:
    k=g&(np.abs(t-TC)<1.0)&(t>3914.4); A=np.vstack([np.ones(k.sum()),t[k]-TC,(t[k]-TC)**2,inb[k].astype(float)]).T
    cc,*_=np.linalg.lstsq(A,c[k],rcond=None); res=c[k]-A@cc
    print(f" {nm} centroid in-box offset {cc[3]*1e3:.3f} mpx (rms {np.std(res)*1e3:.2f} mpx per cadence)")
fig,ax=plt.subplots(5,1,figsize=(11,11),sharex=True)
for i,c in enumerate(["SAP_FLUX","PDCSAP_FLUX","SAP_BKG","MOM_CENTR1","MOM_CENTR2"]):
    gg=m&g; ax[i].plot(t[gg],r[c][gg],',k'); ax[i].set_ylabel(c); ax[i].axvspan(TC-DUR/2,TC+DUR/2,color='g',alpha=.15)
    for d in dumps[np.abs(dumps-TC)<w]: ax[i].axvline(d,color='b',lw=.5)
plt.tight_layout(); plt.savefig("figs/step3_flags_S96.png",dpi=100)
