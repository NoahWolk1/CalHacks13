"""Face-value batman fit of the S65 feature (TESS-SPOC SAP, 200 s), circular, P fixed at 833 d (vet) and 100 d;
free tc, k (in pair light), b, log rho*; baseline (a) local quadratic in ±1 d or (b) jointly fitted harmonic model over the whole sector.
Catalog-like density of the target from Gaia FLAME: M 1.147, R 1.737 -> rho 0.219 rho_sun (companion SB1 primary: M 1.176, R 1.478 -> 0.364)."""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, json, batman
from scipy.optimize import minimize
from lcio import load_all
from common import *
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
G=6.674e-8; RHO_T=1.147/1.737**3; RHO_C=1.176/1.478**3
r=load_all(authors=["TESS-SPOC"],sectors=[65])[0]
t=r["t"]; y=r["SAP_FLUX"]; ok=np.isfinite(y)&(r["q"]==0); t,y=t[ok],y[ok]/np.median(y[ok])
H=harm_design(t,((PB,3),(4.42,2)),2)
def aRs(rho,P): return (G*rho*1.408*(P*86400)**2/(3*np.pi))**(1/3)
def tmodel(tc,k,b,lrho,P,tt):
    p=batman.TransitParams(); p.t0=tc; p.per=P; p.rp=k; a=aRs(10**lrho,P); p.a=a
    if b>=1+k or b>=a: return None
    p.inc=np.degrees(np.arccos(b/a)); p.ecc=0; p.w=90; p.u=[0.24,0.30]; p.limb_dark="quadratic"
    return batman.TransitModel(p,tt,supersample_factor=3,exp_time=200/86400).light_curve(p)
def chi2(th,P,mode,ret=False):
    tc,k,b,lrho=th
    if not(0.005<k<0.3 and abs(tc-TC1)<0.2 and 0<=b<1.3 and -2.5<lrho<1.5): return 1e12
    if mode=="local":
        w=np.abs(t-TC1)<1.0; tt,yy=t[w],y[w]; m=tmodel(tc,k,b,lrho,P,tt)
        if m is None: return 1e12
        A=np.vstack([np.ones_like(tt),tt-TC1,(tt-TC1)**2]).T; c=np.linalg.lstsq(A,yy/m,rcond=None)[0]; f=(A@c)*m
    else:
        tt,yy=t,y; m=tmodel(tc,k,b,lrho,P,tt)
        if m is None: return 1e12
        c=np.linalg.lstsq(H,yy/m,rcond=None)[0]; f=(H@c)*m
    s=sig[mode]; X=np.sum(((yy-f)/s)**2)
    return (X,tt,yy,f,m) if ret else X
# white-noise sigma per mode from the no-transit residual rms
sig={}
w=np.abs(t-TC1)<1.0; A=np.vstack([np.ones(w.sum()),t[w]-TC1,(t[w]-TC1)**2]).T; c=np.linalg.lstsq(A,y[w],rcond=None)[0]; sig["local"]=np.std(y[w]-A@c)
c=np.linalg.lstsq(H,y,rcond=None)[0]; sig["harmonic"]=np.std(y-H@c)
chi0={"local":np.sum(((y[w]-np.vstack([np.ones(w.sum()),t[w]-TC1,(t[w]-TC1)**2]).T@np.linalg.lstsq(np.vstack([np.ones(w.sum()),t[w]-TC1,(t[w]-TC1)**2]).T,y[w],rcond=None)[0])/sig["local"])**2),
      "harmonic":np.sum(((y-H@np.linalg.lstsq(H,y,rcond=None)[0])/sig["harmonic"])**2)}
out={}; best={}
for mode in ["local","harmonic"]:
    for P in [833.018,100.0]:
        bestf=None
        for b0 in [0.1,0.5,0.8,0.95]:
            for lr in [-1.5,-0.66,0.0]:
                for k0 in [0.02,0.04]:
                    res=minimize(chi2,[TC1,k0,b0,lr],args=(P,mode),method="Nelder-Mead",options=dict(maxiter=3000,xatol=1e-5,fatol=1e-3))
                    if bestf is None or res.fun<bestf.fun: bestf=res
        tc,k,b,lr=bestf.x; X,tt,yy,f,m=chi2(bestf.x,P,mode,True)
        # chi2 profile at the target's catalog density, best other params
        rc=min([minimize(lambda th:chi2([th[0],th[1],th[2],np.log10(RHO_T)],P,mode),[tc,k,bb],method="Nelder-Mead").fun for bb in [0.0,0.5,0.85,0.95]])
        dep=1-m.min()
        T14=(tt[m<1].max()-tt[m<1].min())*24 if (m<1).any() else 0
        n=len(tt); bic_tr=X+4*np.log(n); bic0=chi0[mode]
        out[f"{mode} P={P}"]=dict(tc=tc,k_pair=k,k_target=k/np.sqrt(1-0.419),b=b,rho=10**lr,rho_over_target_catalog=10**lr/RHO_T,depth_pair_ppt=dep*1e3,T14_h=T14,
             dchi2_vs_no_transit=chi0[mode]-X,dBIC_no_transit_minus_transit=bic0-bic_tr,dchi2_at_catalog_rho=rc-X,sig_ppt=sig[mode]*1e3)
        print(mode,P,{k_:round(float(v),4) for k_,v in out[f"{mode} P={P}"].items()})
        best[(mode,P)]=(tt,yy,f,m)
json.dump(out,open("data/step6_fit.json","w"),indent=1)
fig,ax=plt.subplots(1,2,figsize=(13,4.5))
for a,mode in zip(ax,["local","harmonic"]):
    tt,yy,f,m=best[(mode,833.018)]; w=np.abs(tt-TC1)<1.0; base=f/m
    tb=tt[w]; nb=9; n=len(tb)//nb
    a.plot(tt[w],(yy[w]/base[w]-1)*1e3,',',color='0.7'); a.plot(tb[:n*nb].reshape(n,nb).mean(1),((yy[w]/base[w])[:n*nb].reshape(n,nb).mean(1)-1)*1e3,'k.')
    a.plot(tt[w],(m[w]-1)*1e3,'r-'); o=out[f"{mode} P=833.018"]
    a.set_title(f"{mode} baseline: depth {o['depth_pair_ppt']:.2f} ppt, T14 {o['T14_h']:.1f} h, b {o['b']:.2f}, rho {o['rho']:.2f} rho_sun, dBIC {o['dBIC_no_transit_minus_transit']:.0f}",fontsize=8)
    a.set_ylim(-4,3); a.set_xlabel("BTJD")
plt.tight_layout(); plt.savefig("figs/fit_s65.png",dpi=110)
