"""Zoom on 2189.5-2191.2 (S32): SAP, PDCSAP, background, centroids, quality flags, per-cadence, for TESS-SPOC and QLP."""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, json
from lcio import load_all
from common import *
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
fig,ax=plt.subplots(6,1,figsize=(12,15),sharex=True)
for r in load_all(sectors=[32],authors=["TESS-SPOC","QLP"]):
    t=r["t"]; q=r["q"]; w=(t>2188.5)&(t<2192.2); A=r["author"]
    print(A,"cadence",np.median(np.diff(t))*1440,"min")
    ww=w&(np.abs(t-TC)<0.4)
    for i in np.where(ww)[0][::1]:
        print(A, round(t[i],4), q[i], *[round(r[c][i],3) if c in r else None for c in ["SAP_FLUX","PDCSAP_FLUX","KSPSAP_FLUX","SAP_BKG","MOM_CENTR1","MOM_CENTR2","SAP_X","SAP_Y"]])
    nq=q!=0
    print(A,"flagged cadences 2188.5-2192.2:",[(round(float(t[i]),3),int(q[i])) for i in np.where(w&nq)[0]])
    good=w&~nq
    for k,c in enumerate(["SAP_FLUX","PDCSAP_FLUX" if A!="QLP" else "KSPSAP_FLUX","SAP_BKG"]):
        y=r[c]; ax[k].plot(t[good],y[good]/np.nanmedian(y[good]) if k<2 else y[good],'.',ms=2,label=A+" "+c)
        ax[k].plot(t[w&nq],(y/np.nanmedian(y[good]) if k<2 else y)[w&nq],'rx',ms=4)
    for k,c in enumerate(["MOM_CENTR1","MOM_CENTR2"] if A!="QLP" else ["SAP_X","SAP_Y"]):
        y=r[c]; ax[3+k].plot(t[good],y[good]-np.nanmedian(y[good]),'.',ms=2,label=A+" "+c)
    if "POS_CORR1" in r: ax[5].plot(t[good],r["POS_CORR1"][good]-np.nanmedian(r["POS_CORR1"][good]),'.',ms=2,label="POS_CORR1"); ax[5].plot(t[good],r["POS_CORR2"][good]-np.nanmedian(r["POS_CORR2"][good]),'.',ms=2,label="POS_CORR2")
for a in ax: a.axvspan(TC-DUR/2,TC+DUR/2,color='orange',alpha=.2); a.legend(fontsize=7)
plt.tight_layout(); plt.savefig("figs/step2_zoom_s32.png",dpi=95)
