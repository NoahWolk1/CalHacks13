import numpy as np, matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
from lcio import load_all
TC=3084.74
L=load_all()
for r in L:
    t=r["t"]; print(r["sector"], r["camera"], r["ccd"], f"{np.nanmin(t):.2f}-{np.nanmax(t):.2f}", [c for c in r["cols"] if "FLUX" in c], r["hdr1"].get("CROWDSAP"), r["hdr1"].get("FLFRCSAP"))
ev=[r for r in L if r["t"].min()<TC<r["t"].max()]
fig,ax=plt.subplots(4,1,figsize=(12,12))
for r in ev:
    t=r["t"]; ok=np.isfinite(t)
    for i,c in enumerate(["SAP_FLUX","KSPSAP_FLUX","DET_FLUX","SYS_RM_FLUX"]):
        if c in r:
            f=r[c]; g=ok&np.isfinite(f)&(r["q"]==0); ax[i].plot(t[g],f[g]/np.nanmedian(f[g]),'.',ms=1); ax[i].set_title(f"S{r['sector']} {c}")
            ax[i].axvline(TC,color='r',alpha=.3)
plt.tight_layout(); plt.savefig("figs/step2_event_sector.png",dpi=90)
fig,ax=plt.subplots(4,1,figsize=(12,10))
for r in ev:
    t=r["t"]
    for i,c in enumerate(["SAP_FLUX","KSPSAP_FLUX","DET_FLUX","SAP_BKG"]):
        if c in r:
            f=r[c]; g=np.isfinite(t)&np.isfinite(f)&(np.abs(t-TC)<3)
            ax[i].plot(t[g],f[g]/np.nanmedian(f[g]) if c!="SAP_BKG" else f[g],'.',ms=2,c='k'); 
            gq=g&(r["q"]!=0); ax[i].plot(t[gq],(f[gq]/np.nanmedian(f[g])) if c!="SAP_BKG" else f[gq],'x',ms=3,c='r')
            ax[i].set_title(c); ax[i].axvspan(TC-0.125,TC+0.125,color='y',alpha=.3)
plt.tight_layout(); plt.savefig("figs/step2_window.png",dpi=90)
