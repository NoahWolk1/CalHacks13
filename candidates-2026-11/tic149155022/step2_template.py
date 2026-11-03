"""Model every brightening with a stretchable empirical template (median profile of all brightenings >3%),
then measure a 4 h box in the residuals at the event's offset (+0.243 d) and the deepest box at 0.05-0.6 d.
If the event's residual is typical of other brightenings, the 'transit' is the variable's own profile."""
import numpy as np, json, matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
from scipy.signal import find_peaks
from scipy.ndimage import median_filter
from scipy.optimize import least_squares
from scipy.interpolate import interp1d
from lcio import load_all
from measure import trapezoid
from cfg import *
P=[]
for r in load_all(authors=["QLP"]):
    g=(r["q"]==0)&np.isfinite(r["SAP_FLUX"]); t=r["t"][g]; f=r["SAP_FLUX"][g]/np.nanmedian(r["SAP_FLUX"][g])
    dt=np.median(np.diff(t)); base=median_filter(f,size=max(3,int(3.0/dt))|1); fs=median_filter(f,size=max(3,int(0.05/dt))|1)
    pk,_=find_peaks(fs-base,height=0.03,distance=int(1.0/dt))
    for p in pk:
        w=(np.abs(t-t[p])<1.0)&np.isfinite(f)
        if w.sum()<0.8*2/dt: continue
        P.append(dict(sector=r["sector"],tp=t[p],h=fs[p]-base[p],x=t[w]-t[p],y=f[w],dt=dt))
grid=np.arange(-1,1.0001,0.01)
prof=[]
for p in P:
    yb=np.interp(grid,p["x"],(p["y"]-np.median(p["y"][np.abs(p["x"])>0.7]))/p["h"],left=np.nan,right=np.nan)
    prof.append(yb)
T=np.nanmedian(np.array(prof),0); ok=np.isfinite(T); T=np.interp(grid,grid[ok],T[ok]); Tf=interp1d(grid,T,bounds_error=False,fill_value=(T[0],T[-1]))
def fit(p,mask_box=None):
    x,y=p["x"],p["y"]; keep=np.ones_like(x,bool) if mask_box is None else (np.abs(x-mask_box)>DUR/2)
    def resid(q):
        a,b,h,x0,s1,s2=q; u=x-x0; xx=np.where(u<0,u/s1,u/s2)
        return (a+b*x+h*Tf(xx)-y)[keep]
    q=least_squares(resid,[1,0,p["h"],0,1,1],bounds=([0.5,-1,0,-0.1,0.5,0.5],[1.5,1,1,0.1,2,2])).x
    a,b,h,x0,s1,s2=q; u=x-x0; xx=np.where(u<0,u/s1,u/s2); return y-(a+b*x+h*Tf(xx)), q
def box(x,r,tc):
    s=trapezoid(x,tc,DUR); A=np.vstack([-s,np.ones_like(x)]).T; c=np.linalg.lstsq(A,r,rcond=None)[0]
    rr=r-A@c; return c[0], np.sqrt(np.linalg.pinv(A.T@A)[0,0])*np.std(rr)
res=[]
for p in P:
    r0,q=fit(p)                       # template fitted with no mask
    rm,qm=fit(p,mask_box=0.2426)      # template fitted with the event-offset box masked
    d0=box(p["x"],r0,0.2426); dm=box(p["x"],rm,0.2426)
    offs=np.arange(0.05,0.61,0.01); dd=[box(p["x"],rm if False else r0,o)[0] for o in offs]
    res.append(dict(sector=p["sector"],t_peak=round(p["tp"],3),height=round(p["h"],4),stretch=(round(q[4],2),round(q[5],2)),
        resid_depth_at_event_offset=round(d0[0]*1e3,2),masked_fit_depth=round(dm[0]*1e3,2),err=round(dm[1]*1e3,2),
        deepest_any_offset=round(max(dd)*1e3,2),rms_ppt=round(np.std(r0)*1e3,2)))
ev=[x for x in res if abs(x["t_peak"]-3712.55)<0.1][0]; print("event:",ev)
for k in ["resid_depth_at_event_offset","masked_fit_depth","deepest_any_offset"]:
    v=np.array([x[k] for x in res]); print(f"{k}: median {np.median(v):.2f}, robust sd {1.4826*np.median(np.abs(v-np.median(v))):.2f}, event {ev[k]}, frac >= event {(v>=ev[k]).mean():.3f} (N={len(v)})")
print("by depth (masked fit):",sorted([(x['sector'],x['t_peak'],x['masked_fit_depth'],x['err'],x['height']) for x in res],key=lambda z:-z[2])[:8])
json.dump(dict(res=res,template_grid=grid.tolist(),template=T.tolist()),open("data/step2_template.json","w"),indent=1,default=float)
p=[p for p in P if abs(p["tp"]-3712.55)<0.1][0]; rm,qm=fit(p,mask_box=0.2426)
fig,ax=plt.subplots(2,1,figsize=(9,6),sharex=True)
ax[0].plot(p["x"],p["y"],".",ms=3); ax[0].plot(p["x"],p["y"]-rm,"r-",label="stretched template fitted with the box masked"); ax[0].legend(fontsize=8)
ax[1].plot(p["x"],rm*1e3,".",ms=3); b=12; n=len(p["x"])//b; ax[1].plot(p["x"][:n*b].reshape(n,b).mean(1),rm[:n*b].reshape(n,b).mean(1)*1e3,"k-")
for a in ax: a.axvspan(0.2426-DUR/2,0.2426+DUR/2,alpha=.2)
ax[1].set_ylabel("resid [ppt]"); ax[1].set_xlabel("days from brightening maximum (3712.543)")
plt.tight_layout(); plt.savefig("figs/event_template_fit.png",dpi=90)
# symmetry check: the same box on the rising flank (mirror offset) in the event's residuals
for off in [-0.2426,-0.20,0.2426]:
    d,e=box(p["x"],rm,off); print(f"event brightening, masked-fit residual box at {off:+.3f} d: {d*1e3:.2f} +- {e*1e3:.2f} ppt")
r0,q0=fit(p)
for off in [-0.2426,0.2426]:
    d,e=box(p["x"],r0,off); print(f"event brightening, unmasked-fit residual box at {off:+.3f} d: {d*1e3:.2f} +- {e*1e3:.2f} ppt")
