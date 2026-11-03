"""Face-value batman fits to TESS-SPOC S32 SAP within ±1 d: (a) transit + linear baseline (what a pipeline without a step term sees),
(b) transit + linear baseline + step at 2190.358. Circular, P fixed at 636 d (vet's most probable). Host rho 2.74 rho_sun (TIC), Gaia FLAME
M 0.777, R 0.694 -> 2.32 rho_sun. Upper limit on depth with the step modelled."""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, json, batman
from scipy.optimize import minimize
from lcio import load_all
from common import *
G=6.674e-8; TS=2190.358; P=636.0
r=[x for x in load_all(authors=["TESS-SPOC"],sectors=[32])][0]
t=r["t"]; y=r["SAP_FLUX"]; ok=np.isfinite(y)&(r["q"]==0)&(np.abs(t-TC)<1.0); t,y=t[ok],y[ok]/np.median(y[ok])
def aRs(rho): return (G*rho*1.408*(P*86400)**2/(3*np.pi))**(1/3)
def tm(tc,k,b,lrho):
    p=batman.TransitParams(); p.t0=tc; p.per=P; p.rp=k; a=aRs(10**lrho); p.a=a; p.inc=np.degrees(np.arccos(min(b/a,1))); p.ecc=0; p.w=90; p.u=[0.45,0.2]; p.limb_dark="quadratic"
    return batman.TransitModel(p,t,supersample_factor=5,exp_time=600/86400).light_curve(p)
def base(m,step):
    cols=[np.ones_like(t),t-TC]+([(t>TS).astype(float)] if step else []); A=np.vstack(cols).T*m[:,None]
    c=np.linalg.lstsq(A,y,rcond=None)[0]; return A@c
sig=None
def chi(th,step):
    tc,k,b,lrho=th
    if not(0.0<=k<0.3 and abs(tc-TC)<0.3 and 0<=b<1+k and -1<lrho<2): return 1e12
    m=tm(tc,k,b,lrho); return np.sum(((y-base(m,step))/sig)**2)
f0=base(np.ones_like(t),True); sig=np.std(y-f0)
out={}
for step in [False,True]:
    chi0=np.sum(((y-base(np.ones_like(t),step))/sig)**2); best=None
    for b0 in [0.1,0.5,0.9]:
        for k0 in [0.03,0.07]:
            for lr in [-0.3,0.4,1.0]:
                rr=minimize(chi,[TC,k0,b0,lr],args=(step,),method="Nelder-Mead",options=dict(maxiter=4000,xatol=1e-6,fatol=1e-4))
                if best is None or rr.fun<best.fun: best=rr
    tc,k,b,lr=best.x; m=tm(*best.x); inn=m<1
    o=dict(tc=tc,k=k,b=b,rho=10**lr,depth_ppt=(1-m.min())*1e3,T14_h=float((t[inn].max()-t[inn].min())*24) if inn.any() else 0,dchi2_vs_baseline_only=chi0-best.fun,
           dBIC=chi0-best.fun-4*np.log(len(t)),Rp_Rearth=k*0.694*109.1)
    if step:
        # 3-sigma upper limit on a box-shaped dip at the vet's tc/duration with the step modelled
        from measure import trapezoid
        D=-trapezoid(t,TC,DUR); A=np.vstack([np.ones_like(t),t-TC,(t>TS).astype(float),D]).T; c=np.linalg.lstsq(A,y,rcond=None)[0]
        cov=np.linalg.pinv(A.T@A)*np.var(y-A@c)
        res=y-A@c; nb=int(round(DUR/3/np.median(np.diff(t)))); n=len(res)//nb; beta=max(1,np.std(res[:n*nb].reshape(n,nb).mean(1))/(np.std(res)/np.sqrt(nb)))
        o["box_depth_ppt"]=c[3]*1e3; o["box_sig_ppt"]=np.sqrt(cov[3,3])*beta*1e3; o["box_3sig_upper_ppt"]=(c[3]+3*np.sqrt(cov[3,3])*beta)*1e3
        o["Rp_3sig_upper_Rearth"]=np.sqrt(max(o["box_3sig_upper_ppt"],0)/1e3)*0.694*109.1
    out["with step" if step else "no step"]=o; print("with step" if step else "no step",{a:round(float(v),4) for a,v in o.items()})
json.dump(out,open("data/step6_fit.json","w"),indent=1)
