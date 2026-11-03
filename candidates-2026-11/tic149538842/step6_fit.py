"""Face-value batman fit of the S65 feature in QLP DET_FLUX (the vet's flux), circular, P = 895 d (vet) and 100 d;
free tc, k, b, log rho*; local quadratic baseline in +-1 d. Also host size and the implied companion radius."""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, json, batman
from scipy.optimize import minimize
from lcio import load_all
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
TC=3084.74; G=6.674e-8
GA=json.load(open("data/gaia_target.json"))["gaiadr3.astrophysical_parameters_row"]
R_FL,M_FL=GA["radius_flame"],GA["mass_flame"]; R_GSP=GA["radius_gspphot"]
RHO_FL=M_FL/R_FL**3; RHO_GSP=1.3/R_GSP**3
r=load_all(sectors=[65])[0]; t=r["t"]; y=r["DET_FLUX"]; ok=np.isfinite(y)&(r["q"]==0)&(np.abs(t-TC)<1.0); t,y=t[ok],y[ok]/np.median(y[ok])
def aRs(rho,P): return (G*rho*1.408*(P*86400)**2/(3*np.pi))**(1/3)
def tmodel(tc,k,b,lrho,P,tt):
    p=batman.TransitParams(); p.t0=tc; p.per=P; p.rp=k; a=aRs(10**lrho,P); p.a=a
    if b>=1+k or b>=a: return None
    p.inc=np.degrees(np.arccos(b/a)); p.ecc=0; p.w=90; p.u=[0.45,0.20]; p.limb_dark="quadratic"
    return batman.TransitModel(p,tt,supersample_factor=3,exp_time=200/86400).light_curve(p)
A=np.vstack([np.ones_like(t),t-TC,(t-TC)**2]).T; c0=np.linalg.lstsq(A,y,rcond=None)[0]; sig=np.std(y-A@c0); chi0=np.sum(((y-A@c0)/sig)**2)
def chi2(th,P,ret=False):
    tc,k,b,lrho=th
    if not(0.01<k<0.3 and abs(tc-TC)<0.2 and 0<=b<1.3 and -3<lrho<1.5): return 1e12
    m=tmodel(tc,k,b,lrho,P,t)
    if m is None: return 1e12
    c=np.linalg.lstsq(A,y/m,rcond=None)[0]; f=(A@c)*m; X=np.sum(((y-f)/sig)**2)
    return (X,f,m) if ret else X
out={}
for P in [895.0,100.0]:
    best=None
    for b0 in [0.1,0.5,0.8,0.95]:
        for lr in [-2,-1.4,-0.5,0.0]:
            res=minimize(chi2,[TC,0.06,b0,lr],args=(P,),method="Nelder-Mead",options=dict(maxiter=4000,xatol=1e-5,fatol=1e-3))
            if best is None or res.fun<best.fun: best=res
    tc,k,b,lr=best.x; X,f,m=chi2(best.x,P,True)
    rc=min(minimize(lambda th:chi2([th[0],th[1],th[2],np.log10(RHO_FL)],P),[tc,k,bb],method="Nelder-Mead").fun for bb in [0,0.5,0.85,0.95])
    T14=(t[m<1].max()-t[m<1].min())*24
    out[f"P={P}"]=dict(tc=tc,k=k,b=b,rho=10**lr,rho_over_flame=10**lr/RHO_FL,depth_ppt=(1-m.min())*1e3,T14_h=T14,dchi2_vs_flat=chi0-X,dchi2_at_flame_rho=rc-X)
    print(P,{kk:round(float(v),4) for kk,v in out[f"P={P}"].items()})
    if P==895.0: bestm=(f,m)
# size of the companion for the real host
RE=6371/695700
for lab,R in [("TIC",0.858),("GSP-Phot",R_GSP),("FLAME",R_FL)]:
    for D in [3.3e-3,4.6e-3]:
        out[f"Rp_{lab}_D{D*1e3:.1f}"]=float(np.sqrt(D)*R/RE); print(lab,R,D,"Rp [Re]",round(np.sqrt(D)*R/RE,1),"[Rj]",round(np.sqrt(D)*R/RE/11.21,2))
# expected central T14 for FLAME host
for P in [10,30,100,447.5,895]:
    a=aRs(RHO_FL,P); T=P/np.pi*np.arcsin(1/a)*24; out[f"T14_central_P{P}"]=T; print("central T14 at P",P,round(T,1),"h")
out.update(R_flame=R_FL,M_flame=M_FL,rho_flame=RHO_FL,R_gspphot=R_GSP)
json.dump(out,open("data/step6_fit.json","w"),indent=1)
f,m=bestm; base=f/m
plt.figure(figsize=(8,4)); plt.plot(t,(y/base-1)*1e3,'.',ms=2,c='0.6'); plt.plot(t,(m-1)*1e3,'r'); plt.axvline(3084.46,ls=':',c='b',label='flare peak'); plt.legend()
o=out["P=895.0"]; plt.title(f"S65 QLP DET_FLUX face-value fit: depth {o['depth_ppt']:.1f} ppt, T14 {o['T14_h']:.1f} h, b {o['b']:.2f}, rho/rho_FLAME {o['rho_over_flame']:.2f}",fontsize=8)
plt.savefig("figs/step6_fit.png",dpi=100)
