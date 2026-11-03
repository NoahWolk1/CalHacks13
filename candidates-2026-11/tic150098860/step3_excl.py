import warnings; warnings.filterwarnings("ignore")
import numpy as np, matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
from lcio import load_all
r=[x for x in load_all() if x["sector"]==4 and x["author"]=="SPOC"][0]
t,q=r["t"],r["q"]
print("S4 cols:",[c for c in r['cols']])
fin=np.isfinite(t)
bins=np.arange(1410.9,1418.6,1/24)
n128,_=np.histogram(t[fin&((q&128)>0)],bins); nall,_=np.histogram(t[fin],bins)
for a,b,c in zip(bins,n128,nall):
    if b: print(f"{a:.3f} excl {b}/{c}")
# compare with sectors 1,2,5: how common is bit 128 outside dumps?
for x in load_all():
    if x['author']!='SPOC' or x['sector']>13: continue
    qq=x['q']; print(x['sector'],"bit128 count",((qq&128)>0).sum(), "bit32",((qq&32)>0).sum())
# flux of excluded cadences vs good ones around event
g=fin&(np.abs(t-1417.1)<1.5)
fig,ax=plt.subplots(3,1,figsize=(11,8),sharex=True)
f=r['SAP_FLUX']/np.nanmedian(r['SAP_FLUX'][g&(q==0)])
ax[0].plot(t[g&(q==0)],f[g&(q==0)],',k'); ax[0].plot(t[g&((q&128)>0)],f[g&((q&128)>0)],'r.',ms=3); ax[0].set_ylim(.995,1.004); ax[0].set_ylabel('SAP (red=bit128)')
ax[1].plot(t[g],r['MOM_CENTR1'][g],',k'); ax[1].plot(t[g&((q&128)>0)],r['MOM_CENTR1'][g&((q&128)>0)],'r.',ms=3); ax[1].set_ylabel('centr1')
ax[2].plot(t[g],r['MOM_CENTR2'][g],',k'); ax[2].plot(t[g&((q&128)>0)],r['MOM_CENTR2'][g&((q&128)>0)],'r.',ms=3); ax[2].set_ylabel('centr2')
for a in ax: a.axvline(1416.936,color='b')
plt.savefig("figs/step3_excl_S4.png",dpi=100)
