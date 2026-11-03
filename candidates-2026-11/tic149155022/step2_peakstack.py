"""Stack all brightenings >3% aligned on their maximum and scaled by height; compare the event's brightening.
Also, for every brightening, the deepest 4 h DET_FLUX box at any offset 0-0.6 d after maximum (fair look-elsewhere)."""
import numpy as np, json, matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
from scipy.signal import find_peaks
from scipy.ndimage import median_filter
from lcio import load_all
from measure import trapezoid
from cfg import *
def boxfit(t,y,tc,dur,order,win):
    w=(np.abs(t-tc)<win)&np.isfinite(y); tt=t[w]; yy=y[w]
    if len(tt)<20 or (np.abs(tt-tc)<dur/2).sum()<0.6*dur/np.median(np.diff(tt)): return np.nan
    s=trapezoid(tt,tc,dur); A=np.vstack([-s]+[((tt-tc)/win)**k for k in range(order+1)]).T
    return np.linalg.lstsq(A,yy,rcond=None)[0][0]
stack=[]; res=[]
for r in load_all(authors=["QLP"]):
    g=(r["q"]==0)&np.isfinite(r["SAP_FLUX"]); t=r["t"][g]; f=r["SAP_FLUX"][g]/np.nanmedian(r["SAP_FLUX"][g]); det=r["DET_FLUX"][g] if "DET_FLUX" in r else r["KSPSAP_FLUX"][g]
    dt=np.median(np.diff(t)); base=median_filter(f,size=max(3,int(3.0/dt))|1); fs=median_filter(f,size=max(3,int(0.05/dt))|1)
    pk,_=find_peaks(fs-base,height=0.03,distance=int(1.0/dt))
    for p in pk:
        tp=t[p]; h=fs[p]-base[p]; w=np.abs(t-tp)<1.0
        if w.sum()<0.8*2/dt: continue
        stack.append((r["sector"],tp,h,t[w]-tp,(f[w]-base[w])/h, dt))
        offs=np.arange(0.05,0.61,0.01); d=np.array([boxfit(t,det,tp+o,DUR,1,0.5) for o in offs])
        if np.all(np.isnan(d)): continue
        i=np.nanargmax(d); res.append(dict(sector=r["sector"],t_peak=round(tp,3),height=round(h,4),max_det_depth=round(d[i]*1e3,2),at_offset=round(offs[i],2)))
v=np.array([x["max_det_depth"] for x in res]); ev=[x for x in res if abs(x["t_peak"]-3712.55)<0.1]
print("N brightenings >3%:",len(res)); print("event:",ev)
print("max DET depth after a brightening: median",np.median(v),"90th",np.percentile(v,90),"frac >= event",(v>=ev[0]["max_det_depth"]).mean())
print("top 8:",sorted(res,key=lambda x:-x["max_det_depth"])[:8])
json.dump(dict(res=res),open("data/step2_peakstack.json","w"),indent=1,default=float)
fig,ax=plt.subplots(1,2,figsize=(13,4.5))
for s,tp,h,x,y,dt in stack:
    b=int(round(0.02/dt)) or 1; n=len(x)//b
    ax[0].plot(x[:n*b].reshape(n,b).mean(1),y[:n*b].reshape(n,b).mean(1),c="0.7",lw=.5)
    if abs(tp-3712.55)<0.1: E=(x,y,h)
x,y,h=E; ax[0].plot(x,y,".",c="r",ms=3,label=f"S88 {3712.55}, height {h*100:.1f}%")
ax[0].axvspan(TC-3712.5434-DUR/2,TC-3712.5434+DUR/2,alpha=.2); ax[0].set_xlim(-1,1); ax[0].set_ylim(-0.6,1.4)
ax[0].set_xlabel("days from brightening maximum"); ax[0].set_ylabel("(SAP - baseline)/height"); ax[0].legend()
ax[1].hist(v,40); ax[1].axvline(ev[0]["max_det_depth"],c="r"); ax[1].set_xlabel("deepest 4 h DET_FLUX box 0.05-0.6 d after a brightening [ppt]")
plt.tight_layout(); plt.savefig("figs/peak_stack.png",dpi=90)
