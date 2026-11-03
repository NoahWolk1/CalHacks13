"""Overview: S5 SPOC SAP/PDCSAP around the event and the whole sector."""
import warnings; warnings.filterwarnings("ignore")
import numpy as np
from lcio import load_all
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
TC=1456.31
rs=load_all(sectors=[5])
for r in rs: print(r["author"],r["file"].split("/")[-1],[c for c in r["cols"] if "FLUX" in c or "BKG" in c][:12], len(r["t"]))
fig,ax=plt.subplots(3,1,figsize=(13,11))
for r in rs:
    if r["author"]!="SPOC": continue
    t,q=r["t"],r["q"]
    for c,col in [("SAP_FLUX","k"),("PDCSAP_FLUX","C1")]:
        y=r[c]/np.nanmedian(r[c]); ok=(q==0)&np.isfinite(y)
        ax[0].plot(t[ok],y[ok],',',color=col)
        w=ok&(np.abs(t-TC)<1.5); ax[1].plot(t[w],y[w],'.',ms=2,color=col,label=c)
        w=ok&(np.abs(t-TC)<0.4); ax[2].plot(t[w],y[w],'.',ms=3,color=col)
    allq=np.abs(t-TC)<1.5; print("flagged cadences within 1.5d:",{int(v):int((allq&(q==v)).sum()) for v in np.unique(q[allq]) if v})
    b=r["SAP_BKG"]; ax[1].plot(t[allq],1+ (b[allq]-np.nanmedian(b[allq]))/np.nanmedian(r["SAP_FLUX"]),'b,',label='SAP_BKG (scaled)')
ax[1].legend(); [a.axvline(TC,color='r',lw=.5) for a in ax]
plt.tight_layout(); plt.savefig("figs/step2_look_s5.png",dpi=100)
