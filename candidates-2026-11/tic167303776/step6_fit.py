"""Face-value batman fit of the S5 event (SPOC SAP 2-min, ±0.6 d local quadratic): circular, P fixed 247.71 d (vet) ; free tc,k,b,log rho.
Also: a symmetric-vs-asymmetric test (ingress vs egress half depths) and the corotation-radius occultation duration."""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, json, batman
from scipy.optimize import minimize
from lcio import load_all
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
TC=1456.295; G=6.674e-8; RHO_CAT=7.64; Pv=247.71084
r=load_all(authors=["SPOC"],sectors=[5])[0]; t=r["t"]; y=r["SAP_FLUX"]; ok=np.isfinite(y)&(r["q"]==0)&(np.abs(t-TC)<0.6); t,y=t[ok],y[ok]/np.median(y[ok])
A=np.vstack([np.ones_like(t),t-TC,(t-TC)**2]).T
def aRs(rho,P): return (G*rho*1.408*(P*86400)**2/(3*np.pi))**(1/3)
def model(th,P=Pv):
    tc,k,b,lr=th; p=batman.TransitParams(); p.t0=tc; p.per=P; p.rp=k; a=aRs(10**lr,P); p.a=a
    if b>=1+k or b>=a: return None
    p.inc=np.degrees(np.arccos(b/a)); p.ecc=0; p.w=90; p.u=[0.3,0.35]; p.limb_dark="quadratic"
    return batman.TransitModel(p,t,supersample_factor=3,exp_time=120/86400).light_curve(p)
def chi(th,ret=False):
    tc,k,b,lr=th
    if not(0.05<k<0.9 and abs(tc-TC)<0.05 and 0<=b<1.8 and -2<lr<2.5): return 1e12
    m=model(th)
    if m is None: return 1e12
    c=np.linalg.lstsq(A,y/m,rcond=None)[0]; f=(A@c)*m; X=np.sum((y-f)**2)
    return (X,f,m) if ret else X
best=None
for b0 in [0.1,0.5,0.8,1.0]:
    for lr in [-0.5,0.5,1.0]:
        for k0 in [0.3,0.45]:
            rr=minimize(chi,[TC,k0,b0,lr],method="Nelder-Mead",options=dict(maxiter=4000,xatol=1e-6,fatol=1e-6))
            if best is None or rr.fun<best.fun: best=rr
X,f,m=chi(best.x,True); n=len(t); sig=np.sqrt(X/n)
# chi2 at catalog density
rc=min(minimize(lambda th:chi([th[0],th[1],th[2],np.log10(RHO_CAT)]),[best.x[0],best.x[1],bb],method="Nelder-Mead",options=dict(maxiter=3000)).fun for bb in [0,0.5,0.8,1.0])
c0=np.linalg.lstsq(A,y,rcond=None)[0]; X0=np.sum((y-A@c0)**2)
tc,k,b,lr=best.x
inT=m<1; T14=(t[inT].max()-t[inT].min())*24
# asymmetry: residual-free halves
base=f/m; dn=y/base; pre=(t>tc-T14/48)&(t<tc); post=(t>tc)&(t<tc+T14/48)
out=dict(tc=tc,k=k,b=b,rho=10**lr,rho_over_catalog=10**lr/RHO_CAT,depth_ppt=(1-m.min())*1e3,T14_h=T14,Rp_Rearth=k*0.354*109.1,
         dchi2_white_vs_flat=(X0-X)/sig**2,dchi2_at_catalog_rho=(rc-X)/sig**2,rms_ppt=sig*1e3,
         mean_deficit_first_half_ppt=(1-dn[pre].mean())*1e3,mean_deficit_second_half_ppt=(1-dn[post].mean())*1e3)
# corotation radius
Ms,Rs,Prot=0.339,0.354,1.8627; a_cor=(6.674e-11*Ms*1.989e30*(Prot*86400)**2/(4*np.pi**2))**(1/3)/(Rs*6.957e8)
out["corotation_radius_Rstar"]=a_cor; out["central_crossing_point_occultor_h"]=Prot/np.pi*np.arcsin(1/a_cor)*24
out["arc_length_for_3.6h_in_Rstar"]=2*np.pi*a_cor*(3.6/24)/Prot
for kk,v in out.items(): print(kk,round(float(v),3))
json.dump(out,open("data/step6_fit.json","w"),indent=1,default=float)
fig,ax=plt.subplots(figsize=(9,4.5)); nb=10; nn=len(t)//nb
ax.plot(t,(dn-1)*1e3,',',color='0.7'); ax.plot(t[:nn*nb].reshape(nn,nb).mean(1),((dn[:nn*nb]).reshape(nn,nb).mean(1)-1)*1e3,'k.')
ax.plot(t,(m-1)*1e3,'r-'); ax.set_title(f"S5 SAP: batman k={k:.2f}, b={b:.2f}, rho={10**lr:.1f} rho_sun (catalog 7.6), T14 {T14:.1f} h",fontsize=9); ax.set_xlabel("BTJD")
plt.tight_layout(); plt.savefig("figs/step6_fit.png",dpi=100)
