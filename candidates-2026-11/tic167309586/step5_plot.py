import warnings; warnings.filterwarnings("ignore")
import numpy as np, json, matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
from lcio import load_all
from common import DUR
L=load_all(); A=json.load(open("data/step5_aliases.json"))["P106.8732"]
ep=[r for r in A if r["SAP"]]
fig,axs=plt.subplots(3,4,figsize=(16,9)); axs=axs.ravel()
for a,r in zip(axs,ep):
    tc=r["tc"]; s=r["SAP"]["sector"]; au=r["SAP"]["prod"].split()[0]
    R=[x for x in L if x["sector"]==s and x["author"]==au][0]; t=R["t"]; w=(np.abs(t-tc)<1.2)&(R["q"]==0)
    for col,off,c in [("SAP_FLUX",0,"0.3"),("PDCSAP_FLUX",-6,"C0")]:
        y=R[col][w]; y=(y/np.nanmedian(y)-1)*1e3+off; tt=t[w]
        b=np.arange(tc-1.2,tc+1.2,1/48); i=np.digitize(tt,b)
        bm=np.array([(tt[i==k].mean(),np.nanmean(y[i==k])) for k in np.unique(i)])
        a.plot(bm[:,0],bm[:,1],".",ms=3,color=c)
    a.axvspan(tc-DUR/2,tc+DUR/2,color="orange",alpha=.25)
    a.set_title(f"S{s} {au} tc={tc}\nSAP {r['SAP']['depth']}±{r['SAP']['sig']} | PDC {r['PDC']['depth']}±{r['PDC']['sig']} ppt",fontsize=8)
for a in axs[len(ep):]: a.axis("off")
fig.suptitle("Every covered epoch of the vet's P = 106.8732 d (grey SAP, blue PDCSAP − 6 ppt; 30-min bins). Claimed depth 1.14–1.8 ppt.",fontsize=10)
fig.tight_layout(); fig.savefig("figs/P106_epochs.png",dpi=100)
