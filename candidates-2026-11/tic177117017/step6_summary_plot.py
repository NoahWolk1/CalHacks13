import warnings; warnings.filterwarnings("ignore")
import glob, numpy as np
from astropy.io import fits
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
from lcio import load_all
r=[r for r in load_all() if r["sector"]==3][0]
d=fits.open(glob.glob("data/lc_other/**/*tasoc*cbv-lc.fits",recursive=True)[0])[1].data
e=fits.open(glob.glob("data/lc_other/**/*eleanor*.fits",recursive=True)[0])[1].data
o=np.load("data/own_phot_s3.npz")
S=[("QLP KSPSAP",r["t"],r["KSPSAP_FLUX"]),("QLP SAP",r["t"],r["SAP_FLUX"]),("TASOC raw",np.array(d["TIME"],float),np.array(d["FLUX_RAW"],float)),
   ("eleanor-lite PCA",np.array(e["TIME"],float),np.array(e["PCA_FLUX"],float)),("own TESScut r=1.5",o["t"],o["r1.5"])]
EV=[(1385.094,0.125),(1389.59,0.25),(1391.135,0.283),(1394.01,0.2)]
fig,ax=plt.subplots(1,4,figsize=(18,7),sharey=True)
for a,(tc,du) in zip(ax,EV):
    for i,(n,t,f) in enumerate(S):
        w=(np.abs(t-tc)<0.8)&np.isfinite(f)
        if w.sum()<3: continue
        y=f[w]/np.nanmedian(f[w]); a.plot(t[w],y-0.06*i,".",ms=3,label=n)
    a.axvspan(tc-du/2,tc+du/2,color="orange",alpha=.3); a.set_title(f"BTJD {tc}"); a.set_xlabel("BTJD")
    if tc<1386: a.axvline(1385.8966,color="g",ls="--")
ax[0].set_ylim(-0.3+0.95,1.05); ax[0].legend(fontsize=7,loc="lower left"); ax[0].set_ylabel("normalised flux (offset)")
fig.suptitle("S3 events in 5 reductions. Green dashed: S3 science-data start (DRN: before it = ACS pointing tests)")
fig.tight_layout(); fig.savefig("figs/s3_events_all_pipelines.png",dpi=100)
