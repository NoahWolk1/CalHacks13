"""TIC 149155022: (a) does the QLP centroid move with the ~2 d brightenings (variable = target or neighbour)?
(b) the event sits on the falling side of a brightening: measure the same 4 h box at the same position relative to
every other brightening, in DET_FLUX and in SAP with a local smooth model, to see whether such 'dips' are generic."""
import numpy as np, json, matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
from scipy.signal import find_peaks
from scipy.ndimage import median_filter
from lcio import load_all
from measure import trapezoid
from cfg import *
recs=load_all(authors=["QLP"])
out={"centroid":[], "peaks":[]}
def boxfit(t,y,tc,dur,order,win):
    w=(np.abs(t-tc)<win)&np.isfinite(y); tt=t[w]; yy=y[w]
    if (np.abs(tt-tc)<dur/2).sum()<0.6*dur/np.median(np.diff(tt)) or len(tt)<20: return None
    s=trapezoid(tt,tc,dur); A=np.vstack([-s]+[((tt-tc)/win)**k for k in range(order+1)]).T
    c,*_=np.linalg.lstsq(A,yy,rcond=None); r=yy-A@c
    e=np.sqrt(np.linalg.pinv(A.T@A)[0,0])*np.std(r)
    return c[0],e
for r in recs:
    t=r["t"]; g=(r["q"]==0)&np.isfinite(r["SAP_FLUX"])
    if g.sum()<200: continue
    t=t[g]; f=r["SAP_FLUX"][g]/np.nanmedian(r["SAP_FLUX"][g]); x=r["SAP_X"][g]; yc=r["SAP_Y"][g]
    det=r["DET_FLUX"][g] if "DET_FLUX" in r else r.get("KSPSAP_FLUX")[g]
    # (a) centroid vs flux, per orbit, after removing linear trends in time
    for orb in np.unique(r["ORBITID"][g]) if "ORBITID" in r else [None]:
        m=np.ones_like(t,bool) if orb is None else (r["ORBITID"][g]==orb)
        if m.sum()<200: continue
        A=np.vstack([f[m]-1,np.ones(m.sum()),t[m]-t[m].mean(),(t[m]-t[m].mean())**2]).T
        cx=np.linalg.lstsq(A,x[m],rcond=None)[0][0]; cy=np.linalg.lstsq(A,yc[m],rcond=None)[0][0]
        out["centroid"].append(dict(sector=r["sector"],orbit=None if orb is None else int(orb),dx_per_unit_flux=round(cx,4),dy_per_unit_flux=round(cy,4),
                                    ptp_flux=round(np.ptp(np.percentile(f[m],[2,98])),4)))
    # (b) peaks in SAP
    dt=np.median(np.diff(t)); base=median_filter(f,size=max(3,int(3.0/dt))|1)
    pk,_=find_peaks(median_filter(f,size=max(3,int(0.05/dt))|1)-base,height=0.015,distance=int(1.0/dt))
    for p in pk:
        tp=t[p]
        for off in [0.2426]:   # event centre minus peak time (computed below for S88)
            tc=tp+off
            if not (t.min()+0.6<tc<t.max()-0.6): continue
            if np.min(np.abs(t-tc))>0.02: continue
            d1=boxfit(t,det,tc,DUR,1,0.5); d2=boxfit(t,f,tc,DUR,4,0.6); d3=boxfit(t,f,tc,DUR,6,0.8)
            if d1 is None or d2 is None or d3 is None: continue
            out["peaks"].append(dict(sector=r["sector"],t_peak=round(tp,3),height=round(float(f[p]-base[p]),4),
                det_depth=round(d1[0]*1e3,2),det_err=round(d1[1]*1e3,2),sap_poly4=round(d2[0]*1e3,2),sap_poly6=round(d3[0]*1e3,2)))
for c in out["centroid"]: print("centroid",c)
P=out["peaks"]; print("N peaks",len(P))
ev=[p for p in P if abs(p["t_peak"]+0.2426-TC)<0.1]
print("event-peak:",ev)
for k in ["det_depth","sap_poly4","sap_poly6"]:
    v=np.array([p[k] for p in P]); e=ev[0][k] if ev else np.nan
    print(k,"median",np.median(v),"robust sd",1.4826*np.median(np.abs(v-np.median(v))),"event",e,"frac >= event",(v>=e).mean())
    out[k+"_summary"]=dict(median=float(np.median(v)),sd=float(1.4826*np.median(np.abs(v-np.median(v)))),event=e,frac_ge=float((v>=e).mean()))
h=np.array([p["height"] for p in P]); dd=np.array([p["det_depth"] for p in P])
print("corr(height, det depth)",np.corrcoef(h,dd)[0,1])
big=h>0.04; print("peaks taller than 4%:",big.sum(),"their DET depths",dd[big])
json.dump(out,open("data/step2_peaks.json","w"),indent=1,default=float)
fig,ax=plt.subplots(1,2,figsize=(12,4))
ax[0].scatter(h*100,dd,s=8); 
if ev: ax[0].scatter(ev[0]["height"]*100,ev[0]["det_depth"],c="r",s=40,label="the event")
ax[0].set_xlabel("brightening height in SAP [%]"); ax[0].set_ylabel("QLP DET_FLUX 4 h box depth at peak+0.2426 d [ppt]"); ax[0].legend()
ax[1].hist([p["sap_poly6"] for p in P],30); ax[1].axvline(ev[0]["sap_poly6"] if ev else 0,c="r"); ax[1].set_xlabel("SAP depth, local poly6 baseline ±0.8 d [ppt]")
plt.tight_layout(); plt.savefig("figs/peak_relative_depths.png",dpi=90)
