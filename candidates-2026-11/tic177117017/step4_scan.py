"""Scan every sector/product for deep dips (any EB eclipse would show): box search after running-median detrend."""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, json
from scipy.ndimage import median_filter
from lcio import load_all
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
L=load_all(); out=[]; summ=[]
fig,ax=plt.subplots(1,1,figsize=(15,4))
for r in L:
    col="PDCSAP_FLUX" if r["author"]=="TESS-SPOC" else ("KSPSAP_FLUX" if "KSPSAP_FLUX" in r else "DET_FLUX")
    t=r["t"]; f=r[col]; g=(r["q"]==0)&np.isfinite(f)&np.isfinite(t); t,f=t[g],f[g]/np.nanmedian(f[g])
    dt=np.median(np.diff(t)); k=int(1.0/dt)|1
    tr=median_filter(f,size=k,mode="nearest"); d=f-tr
    sig=1.4826*np.median(np.abs(d))
    for dur in [0.0833,0.125,0.25,0.333]:
        n=max(int(round(dur/dt)),1); 
        if len(d)<n*3: continue
        c=np.convolve(d,np.ones(n)/n,mode="valid"); tc=np.convolve(t,np.ones(n)/n,mode="valid")
        s=sig/np.sqrt(n)
        idx=np.where(c<-max(6*s,3e-3))[0]
        for i in idx: out.append(dict(author=r["author"],sector=r["sector"],col=col,t=round(float(tc[i]),3),dur_h=round(dur*24,1),depth_ppt=round(-c[i]*1e3,2),snr=round(-c[i]/s,1)))
    summ.append((r["author"],r["sector"],round(sig*1e3,2)))
    ax.plot(t,d*1e3,".",ms=0.5,color="C0" if r["author"]=="QLP" else "C1")
ax.set_ylim(-60,20); ax.set_xlabel("BTJD"); ax.set_ylabel("detrended flux [ppt]"); ax.set_title("All TESS data, q=0 (QLP blue, SPOC PDCSAP orange)")
fig.tight_layout(); fig.savefig("figs/all_sectors_detrended.png",dpi=100)
# cluster
out.sort(key=lambda x:x["t"]); cl=[]
for e in out:
    if cl and abs(e["t"]-cl[-1][-1]["t"])<0.5: cl[-1].append(e)
    else: cl.append([e])
best=[max(c,key=lambda x:x["snr"]) for c in cl]
for b in best: print(b)
print("per-LC robust point scatter ppt:",summ)
json.dump(dict(events=best,scatter=summ),open("data/step4_scan.json","w"),indent=1)
