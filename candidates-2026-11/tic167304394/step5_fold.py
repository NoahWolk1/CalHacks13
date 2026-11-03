"""P = DeltaT/43 = 22.78 d: per-epoch depths (raw QLP SAP, own fit), odd/even, refined linear ephemeris,
secondary eclipse search over all phases, and check that P/2 (n=86) is excluded."""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, json
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
from scipy.optimize import least_squares
from lcio import load_all
L=sorted(load_all(),key=lambda r:r["sector"])
S5=json.load(open("data/step5_search.json")); tc1=S5["centres"]["main"]["tc"]; P0=S5["DeltaT"]/43
def vmodel(p,t):
    tc,d,w,k=p[:4]; x=np.abs(t-tc)/w; return 1-d*np.clip(1-x**k,0,None)
ep=[]
for r in L:
    t=r["t"]; y=r["SAP_FLUX"]; g=(r["q"]&~4096==0)&np.isfinite(y)&np.isfinite(t)
    if g.sum()<50: continue
    for k in np.arange(np.floor((t[g].min()-tc1)/P0),np.ceil((t[g].max()-tc1)/P0)+1):
        tc0=tc1+k*P0; m=g&(np.abs(t-tc0)<0.6)
        inn=m&(np.abs(t-tc0)<0.06); 
        if inn.sum()<3 or (m&(np.abs(t-tc0)>0.15)).sum()<10: continue
        tt=t[m]; yy=y[m]
        fun=lambda p: yy/(p[4]+p[5]*(tt-tc0))-vmodel(p,tt)
        try: sol=least_squares(fun,[tc0,0.06,0.07,1.4,np.median(yy),0],bounds=([tc0-0.1,0,0.02,0.5,0,-np.inf],[tc0+0.1,0.3,0.2,4,np.inf,np.inf]))
        except Exception as e: continue
        J=sol.jac; cov=np.linalg.pinv(J.T@J)*np.var(sol.fun)
        full=(np.abs(tt-sol.x[0])<sol.x[2]).sum()*np.median(np.diff(tt))/(2*sol.x[2])
        ep.append(dict(sector=int(r["sector"]),epoch=int(k),tc=float(sol.x[0]),tc_err=float(np.sqrt(cov[0,0])),depth_ppt=float(sol.x[1]*1e3),
                       depth_err=float(np.sqrt(cov[1,1])*1e3),hw_h=float(sol.x[2]*24),k=float(sol.x[3]),coverage=float(min(full,1)),rms_ppt=float(np.std(sol.fun)*1e3)))
E=[e for e in ep if e["coverage"]>0.7 and e["depth_err"]<5]
n=np.array([e["epoch"] for e in E]); tc=np.array([e["tc"] for e in E]); w=1/np.array([max(e["tc_err"],2e-4) for e in E])**2
A=np.vstack([np.ones_like(n),n]).T; C=np.linalg.inv(A.T@(A*w[:,None])); sol=C@(A.T@(w*tc))
oc=(tc-A@sol)*1440
print(f"ephemeris T0={sol[0]:.5f}+-{np.sqrt(C[0,0]):.5f} P={sol[1]:.6f}+-{np.sqrt(C[1,1]):.6f}  O-C rms {np.std(oc):.2f} min, chi2/dof {np.sum(((tc-A@sol)**2)*w)/(len(n)-2):.1f}")
for e,o in zip(E,oc): print(f"  S{e['sector']:2d} E{e['epoch']:4d} tc {e['tc']:.4f} O-C {o:6.1f} min  depth {e['depth_ppt']:5.1f}+-{e['depth_err']:.1f}  hw {e['hw_h']:.2f} h  k {e['k']:.2f}  cov {e['coverage']:.2f}")
d=np.array([e["depth_ppt"] for e in E]); de=np.array([e["depth_err"] for e in E])
odd=n%2==1
for nm,mm in [("odd",odd),("even",~odd)]:
    ww=1/de[mm]**2; print(nm,len(d[mm]),"mean depth",round(np.sum(d[mm]*ww)/ww.sum(),2),"+-",round(1/np.sqrt(ww.sum()),2),"scatter",round(np.std(d[mm]),2))
hw=np.array([e["hw_h"] for e in E])
for nm,mm in [("odd",odd),("even",~odd)]: print(nm,"half-width h",round(np.mean(hw[mm]),3),"+-",round(np.std(hw[mm])/np.sqrt(mm.sum()),3))
# secondary: phase-fold detrended SAP with primaries masked
T,F,Ssec=np.load("data/detrended_sap.npy"); gg=np.isfinite(F); T,F,Ssec=T[gg],F[gg],Ssec[gg]
ph=((T-sol[0])/sol[1]+0.5)%1-0.5
mask=np.abs(ph*sol[1])>0.2
bins=np.arange(-0.5,0.5,0.25/sol[1]/24*4)  # ~1 h-wide steps
dur=3.4/24/sol[1]; best=[]
for c in np.arange(-0.5,0.5,0.002):
    m=mask&(np.abs(((ph-c)+0.5)%1-0.5)<dur/2)
    if m.sum()>20: best.append((c,-np.mean(F[m])*1e3,np.std(F[mask])/np.sqrt(m.sum())*1e3, m.sum()))
best=np.array(best); 
# robust red-noise sigma from scatter of box depths
sr=1.4826*np.median(np.abs(best[:,1]-np.median(best[:,1])))
i=np.argmax(best[:,1]); print("secondary: deepest box at phase",round(best[i,0],3),"depth",round(best[i,1],3),"ppt; robust box scatter",round(sr,3),"ppt; at phase 0.5:",best[np.argmin(np.abs(best[:,0]-0.5+0.001))][1:3] if True else "")
j=np.argmin(np.abs(np.abs(best[:,0])-0.5)); print("phase +-0.5 box:",best[j])
print("phase coverage (boxes with >20 pts):",len(best)/500)
# n=86 (P/2) check: depth at phase 0.5 of 22.78 d
json.dump(dict(ephem=dict(T0=sol[0],T0_err=np.sqrt(C[0,0]),P=sol[1],P_err=np.sqrt(C[1,1]),oc_rms_min=float(np.std(oc))),epochs=ep,
   secondary=dict(phase=float(best[i,0]),depth_ppt=float(best[i,1]),sigma_ppt=float(sr),phase05=best[j].tolist())),open("data/step5_fold.json","w"),indent=1)
fig,ax=plt.subplots(2,1,figsize=(10,8))
g=np.abs(ph*sol[1]*24)<6
ax[0].scatter(ph[g]*sol[1]*24,F[g]*1e3,c=Ssec[g],s=1,cmap="viridis"); ax[0].set_xlabel("hours from primary"); ax[0].set_ylabel("ppt (detrended QLP SAP, events not masked except 2)")
ax[0].set_title(f"All QLP sectors folded on P = {sol[1]:.5f} d (colour = sector)")
ax[1].plot(best[:,0],best[:,1],"k.",ms=2); ax[1].set_xlabel("phase"); ax[1].set_ylabel("3.4 h box depth (ppt), primaries masked"); ax[1].axhline(3*sr,color="r",ls=":")
fig.tight_layout(); fig.savefig("figs/fold.png",dpi=100)
