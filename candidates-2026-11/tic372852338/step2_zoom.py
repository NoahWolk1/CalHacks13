"""Zoom on the three sweep-ephemeris epochs in S2/S6 (1365.407, 1381.342, 1476.951) in every product, one panel per product."""
import warnings; warnings.filterwarnings("ignore")
import numpy as np
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
from hlsp import load
from common import P0, T00
L=load()
EP=[0,1,7]
PRODS=[("QLP","SAP_FLUX"),("QLP","KSPSAP_FLUX"),("QLP","SAP_BKG"),("ELEANOR-LITE","RAW_FLUX"),("ELEANOR-LITE","CORR_FLUX"),("ELEANOR-LITE","FLUX_BKG"),
       ("T16","IRM1"),("T16","IRM2"),("TASOC-ENS","FLUX_RAW"),("TASOC-ENS","FLUX_BKG"),("TGLC","cal_aper_flux"),("TGLC","cal_psf_flux")]
fig,axs=plt.subplots(len(PRODS),3,figsize=(15,2.0*len(PRODS)),sharex=True)
for j,k in enumerate(EP):
    tc=T00+k*P0
    for i,(a_,c) in enumerate(PRODS):
        ax=axs[i,j]
        for r in L:
            if r["author"]!=a_ or c not in r["cols"]: continue
            t=r["t"]; y=r["cols"][c]; w=(np.abs(t-tc)<1.5)&np.isfinite(y)
            if w.sum()<5: continue
            g=w&r["good"]; b=w&~r["good"]
            norm=np.nanmedian(y[w]) if "BKG" not in c else 1.0
            sc=1e3 if "BKG" not in c else 1.0
            ax.plot((t[g]-tc)*24,(y[g]/norm-(1 if "BKG" not in c else 0))*sc,"k.",ms=2)
            ax.plot((t[b]-tc)*24,(y[b]/norm-(1 if "BKG" not in c else 0))*sc,"r.",ms=2)
        ax.axvspan(-2,2,color="y",alpha=.2); ax.text(0.01,0.85,f"{a_} {c}",transform=ax.transAxes,fontsize=7)
        if i==0: ax.set_title(f"epoch {k}  tc {tc:.3f}",fontsize=9)
        if "BKG" not in c:
            ax.set_ylim(-60,60)
axs[-1,1].set_xlabel("hours from predicted transit (black: quality 0, red: flagged)")
fig.tight_layout(); fig.savefig("figs/step2_zoom.png",dpi=80)
