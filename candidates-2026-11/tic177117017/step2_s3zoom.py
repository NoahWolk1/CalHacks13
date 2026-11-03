import warnings; warnings.filterwarnings("ignore")
import numpy as np, matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
from lcio import load_all
from lightkurve.utils import TessQualityFlags as F
r=[r for r in load_all() if r["sector"]==3][0]
t,q=r["t"],r["q"]
print(r["cols"])
fig,ax=plt.subplots(4,1,figsize=(14,12),sharex=True)
for i,c in enumerate(["SAP_FLUX","KSPSAP_FLUX","SAP_BKG"]):
    f=r[c]; g=(q==0)
    ax[i].plot(t[g],f[g],".",ms=2); ax[i].plot(t[~g],f[~g],"rx",ms=2); ax[i].set_ylabel(c)
ax[0].set_ylim(0.5,1.5); ax[1].set_ylim(0.6,1.1)
for c,k in [("MOM_CENTR1","k"),("MOM_CENTR2","b")]:
    if c in r: ax[3].plot(t,r[c]-np.nanmedian(r[c]),".",ms=2,color=k,label=c)
ax[3].legend(); ax[3].set_ylim(-1,1)
for a in ax:
    for tc in [1385.094,1389.59,1391.135,1394.01]: a.axvline(tc,color="orange",alpha=.5)
ax[0].set_xlim(1381.5,1400)
fig.savefig("figs/qlp_s3_zoom.png",dpi=100)
# flags summary
for v in np.unique(q):
    tt=t[q==v]; print(v, len(tt), round(tt.min(),3), round(tt.max(),3))
w=(t>1384)&(t<1386.5)
for ti,qi,s,k,b in zip(t[w],q[w],r["SAP_FLUX"][w],r["KSPSAP_FLUX"][w],r["SAP_BKG"][w]): print(f"{ti:.3f} {qi} {s:.4f} {k:.4f} {b:.1f}")
