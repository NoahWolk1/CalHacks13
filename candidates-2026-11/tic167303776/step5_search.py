"""All 37 SPOC sectors (SAP, 2-min -> 10-min bins, 1-d upper-envelope baseline): 3.6 h box at every 0.02 d.
Count dips and brightenings as deep as the event; rank the event; test the vet's P=247.71 d 'ephemeris' and its 1463.03 'repeat'."""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, json
from lcio import load_all
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
TC,DUR=1456.295,0.15; P_rot=1.8627
S=[]
for r in sorted(load_all(authors=["SPOC"]),key=lambda r:r["sector"]):
    t,q=r["t"],r["q"]; y=r["SAP_FLUX"]; ok=(q==0)&np.isfinite(y)&np.isfinite(t); t,y=t[ok],y[ok]/np.nanmedian(y[ok])
    nb=5; m=len(t)//nb; tb=t[:m*nb].reshape(m,nb).mean(1); yb=y[:m*nb].reshape(m,nb).mean(1)
    # baseline: median over ±1 d (robust to dips occupying <50% of time); also an 80th-pct version
    base=np.array([np.median(yb[np.abs(tb-x)<1.0]) for x in tb]); S.append((r["sector"],tb,yb/base))
rows=[]
for s,t,d in S:
    g=np.arange(t.min()+DUR/2,t.max()-DUR/2,0.02); i0=np.searchsorted(t,g-DUR/2); i1=np.searchsorted(t,g+DUR/2); n=i1-i0
    cs=np.concatenate([[0],np.cumsum(d-1)]); okc=n>=0.7*DUR/(10/1440); dep=np.where(okc,-(cs[i1]-cs[i0])/np.maximum(n,1),np.nan)
    for gg,x in zip(g[okc],dep[okc]): rows.append((s,gg,x))
A=np.array(rows); Tg=A[:,1]; Dg=A[:,2]
k=np.argmin(np.abs(Tg-TC)); Dev=Dg[k]; print("event 3.6 h box depth vs local median baseline (ppt):",Dev*1e3)
def extrema(sign,thr):
    v=sign*Dg; idx=np.where(v>=thr)[0]; ev=[]
    for i in idx[np.argsort(-v[idx])]:
        if all(abs(Tg[i]-e)>0.3 for e,_ in ev): ev.append((Tg[i],v[i]))
    return ev
out={}
for frac in [0.5,1.0]:
    thr=frac*Dev; dips=extrema(1,thr); brs=extrema(-1,thr)
    out[f"n_dips_ge_{frac}xevent"]=len(dips); out[f"n_brightenings_ge_{frac}xevent"]=len(brs)
    print(f">= {frac} x event depth ({thr*1e3:.0f} ppt): dips {len(dips)}, brightenings {len(brs)}")
dips=extrema(1,0.5*Dev); dd=np.array(dips)
rank=int(np.sum(dd[:,1]>Dev+1e-9))+1; out["event_rank"]=rank; out["n_dips_ge_70ppt"]=len(dips); print("event rank among dips:",rank,"of",len(dips))
ph=((dd[:,0]-TC)/P_rot)%1; ph=np.where(ph>0.5,ph-1,ph)
R=np.abs(np.mean(np.exp(2j*np.pi*ph))); out["rayleigh_R_deep_dips"]=float(R); out["frac_within_0.15_phase"]=float((np.abs(ph)<0.15).mean()); print("deep dips: Rayleigh R",R,"; fraction within ±0.15 of event phase",out["frac_within_0.15_phase"],"(0.30 if uniform)")
cov=(Tg.max()-Tg.min()); days=len(np.unique(np.round(Tg,1)))*0.1; out["days_covered"]=days; out["deep_dips_per_day"]=len(dips)/days; print("days covered",days,"deep dips/day",len(dips)/days)
# vet ephemeris P=247.7108, T0=1456.31: box depth at each predicted epoch with data
P=247.71084; ep=[]
for n_ in range(-1,12):
    tt=TC+n_*P; j=np.argmin(np.abs(Tg-tt))
    if abs(Tg[j]-tt)<0.03: ep.append(dict(n=n_,t=round(tt,3),depth_ppt=round(float(Dg[j])*1e3,1),pctile_in_sector=round(float((Dg[A[:,0]==A[j,0]]<Dg[j]).mean()),3)))
out["vet_ephemeris_epochs"]=ep; print("vet P=247.71 epochs:",ep)
# how many periods 'line up' 3 random deep dips? expected chance: with 0.6 dips/day of >=70 ppt, P(a dip within ±0.1 d of any predicted time)
out["chance_dip_within_0.1d"]=float(1-np.exp(-len(dips)/days*0.2)); print("chance of a >=70 ppt dip within ±0.1 d of any time:",out["chance_dip_within_0.1d"])
j=np.argmin(np.abs(Tg-1463.03)); out["vet_repeat_1463.03_depth_ppt"]=float(Dg[j]*1e3); out["1463.03_phase"]=float(((1463.03-TC)/P_rot)%1); print("1463.03:",Dg[j]*1e3,"ppt, rotation phase",out["1463.03_phase"])
json.dump(out,open("data/step5_search.json","w"),indent=1,default=float)
fig,ax=plt.subplots(1,2,figsize=(13,4.5))
ax[0].hist(dd[:,1]*1e3,bins=40,color='0.5'); ax[0].axvline(Dev*1e3,color='r'); ax[0].set_xlabel("3.6 h box depth of dips (ppt)"); ax[0].set_title(f"{len(dips)} dips >= {0.5*Dev*1e3:.0f} ppt in 37 sectors; event (red) rank {rank}")
ax[1].hist(ph,bins=30,color='0.5'); ax[1].set_xlabel(f"rotation phase (P={P_rot} d) relative to the event"); ax[1].set_title("phases of those dips")
plt.tight_layout(); plt.savefig("figs/step5_dips.png",dpi=100)
