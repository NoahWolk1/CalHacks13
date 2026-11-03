import warnings; warnings.filterwarnings("ignore")
import numpy as np, matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
from lcio import load_all
L=load_all()
for r in L:
    t=r["t"]; ok=np.isfinite(t)
    print(r["author"], r["sector"], round(np.nanmin(t),2), round(np.nanmax(t),2), [c for c in ["SAP_FLUX","PDCSAP_FLUX","KSPSAP_FLUX","DET_FLUX"] if c in r], r["hdr1"].get("CROWDSAP"), r["hdr1"].get("FLFRCSAP"))
# early-time plot S1-S3
fig,ax=plt.subplots(4,1,figsize=(14,12),sharex=True)
for r in L:
    if r["sector"]>3: continue
    t=r["t"]
    for i,(col,auth) in enumerate([("SAP_FLUX","TESS-SPOC"),("PDCSAP_FLUX","TESS-SPOC"),("SAP_FLUX","QLP"),("KSPSAP_FLUX","QLP")]):
        if r["author"]!=auth or col not in r: continue
        f=r[col]; g=(r["q"]==0)&np.isfinite(f)
        ax[i].plot(t[g],f[g]/np.nanmedian(f[g]),".",ms=2); ax[i].plot(t[~g&np.isfinite(f)],f[~g&np.isfinite(f)]/np.nanmedian(f[g]),"rx",ms=2)
        ax[i].set_ylabel(f"{auth} {col}")
for a in ax:
    for tc in [1385.094,1389.59,1391.135,1394.01]: a.axvline(tc,color="orange",alpha=.4)
fig.savefig("figs/overview_s1_s3.png",dpi=100)
