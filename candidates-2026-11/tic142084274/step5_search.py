"""Search all TESS data for single transit-like dips (1-3 h) and build an exclusion map for a 22 ppt, 2 h dip."""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, json
from scipy.ndimage import median_filter
from lcio import load_all
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
def detrend(t,y,win=0.75):
    o=np.full_like(y,np.nan); 
    # running median in time via sorted window
    j0=0; j1=0; n=len(t)
    for i in range(n):
        while t[j0]<t[i]-win/2: j0+=1
        while j1<n and t[j1]<=t[i]+win/2: j1+=1
        o[i]=np.nanmedian(y[j0:j1])
    return y/o
series={}
for r in load_all():
    a=r["author"]; c={"SPOC":"PDCSAP_FLUX","TESS-SPOC":"PDCSAP_FLUX","QLP":"KSPSAP_FLUX","ELEANOR-LITE":"CORR_FLUX"}[a]
    if c not in r: 
        c="SAP_FLUX" if "SAP_FLUX" in r else None
        if c is None: continue
    t=r["t"]; y=r[c]; ok=np.isfinite(t)&np.isfinite(y)&(r["q"]==0)&(y>0)
    if ok.sum()<100: continue
    t,y=t[ok],y[ok]/np.nanmedian(y[ok]); d=detrend(t,y)
    # clip strong positive outliers (flares) only
    mad=1.4826*np.nanmedian(np.abs(d-1)); keep=d<1+5*mad
    series.setdefault(a,[]).append((r["sector"],t[keep],d[keep],mad))
summary={}
events=[]
for a,L in series.items():
    for s,t,d,mad in L:
        dt=np.median(np.diff(t))
        for dur in [1/24,2/24,3/24]:
            grid=np.arange(t.min(),t.max(),max(dt,0.005))
            idx0=np.searchsorted(t,grid-dur/2); idx1=np.searchsorted(t,grid+dur/2)
            cs=np.concatenate([[0],np.cumsum(d-1)]); n=idx1-idx0
            nexp=dur/dt; okc=n>=0.6*nexp
            dep=np.where(okc,-(cs[idx1]-cs[idx0])/np.maximum(n,1),np.nan)
            # empirical sigma for this sector/duration: robust std of dep over all grid points
            sig=1.4826*np.nanmedian(np.abs(dep-np.nanmedian(dep)))
            snr=dep/sig
            if np.all(~np.isfinite(snr)): continue
            k=np.nanargmax(snr)
            events.append(dict(author=a,sector=int(s),dur_h=round(dur*24),t=round(grid[k],3),depth_ppt=round(dep[k]*1e3,2),sig_ppt=round(sig*1e3,2),snr=round(snr[k],1)))
ev=sorted(events,key=lambda e:-e["snr"])
print("Strongest dip per author/sector/duration, top 30 by SNR:")
for e in ev[:30]: print(e)
# per-author summary of sensitivity: median sigma for 2 h
for a in series:
    s2=[e["sig_ppt"] for e in events if e["author"]==a and e["dur_h"]==2]
    print(a,"sectors",sorted({e['sector'] for e in events if e['author']==a}),"median 2h sigma ppt",np.median(s2))
json.dump(ev,open("data/step5_search.json","w"),indent=1)
# stash detrended series for later steps
np.save("data/series.npy",np.array([(a,s,t,d) for a,L in series.items() for s,t,d,_ in L],dtype=object),allow_pickle=True)
