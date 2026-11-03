"""Face-value batman fit of the event (QLP SAP, q=0, local quadratic baseline over +-1 d), circular orbit,
P fixed at the vet's most-probable value and at 30 d; free tc, k, b, log rho*. Compares the implied density
with the TIC density and gives the chi2 penalty of forcing the catalog density. Usage: step6_fit.py AUTHOR SECTOR COL P1"""
import warnings, json, sys; warnings.filterwarnings("ignore")
import numpy as np, batman
from scipy.optimize import minimize
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
from lcio import load_all
from common import EVENTS
AU,SEC,COL,P1=sys.argv[1],int(sys.argv[2]),sys.argv[3],float(sys.argv[4])
tic=json.load(open("data/tic.json")); RHO=float(tic["rho"]); TEFF=float(tic["Teff"])
TC0=EVENTS[0][1]
r=[x for x in load_all() if x["author"]==AU and x["sector"]==SEC][0]
t=r["t"]; y=r[COL].copy(); ok=np.isfinite(y)&np.isfinite(t)&(r["q"]==0)&(np.abs(t-TC0)<1.0); t,y=t[ok],y[ok]/np.nanmedian(y[ok])
EXP=np.nanmedian(np.diff(t))
G=6.674e-8
def aRs(rho,P): return (G*rho*1.408*(P*86400)**2/(3*np.pi))**(1/3)
U=[0.30,0.24] if TEFF<6100 else [0.28,0.25]
def tmodel(tc,k,b,lrho,P):
    p=batman.TransitParams(); p.t0=tc; p.per=P; p.rp=k; a=aRs(10**lrho,P); p.a=a
    if b>=1+k or b>=a: return None
    p.inc=np.degrees(np.arccos(b/a)); p.ecc=0; p.w=90; p.u=U; p.limb_dark="quadratic"
    return batman.TransitModel(p,t,supersample_factor=5,exp_time=EXP).light_curve(p)
A=np.vstack([np.ones_like(t),t-TC0,(t-TC0)**2]).T
c0=np.linalg.lstsq(A,y,rcond=None)[0]; sig=np.std(y-A@c0); chi0=np.sum(((y-A@c0)/sig)**2)
def chi2(th,P,ret=False):
    tc,k,b,lrho=th
    if not(0.01<k<0.5 and abs(tc-TC0)<0.15 and 0<=b<1.4 and -3<lrho<2): return 1e12
    m=tmodel(tc,k,b,lrho,P)
    if m is None or m.min()>0.99999: return 1e12
    c=np.linalg.lstsq(A,y/m,rcond=None)[0]; f=(A@c)*m; X=np.sum(((y-f)/sig)**2)
    return (X,f,m) if ret else X
out={}
for P in [P1,30.0]:
    best=None
    for b0 in [0.1,0.5,0.8,0.95]:
        for lr in [-1.5,-0.5,0.0,0.5]:
            for k0 in [0.05,0.08]:
                res=minimize(chi2,[TC0,k0,b0,lr],args=(P,),method="Nelder-Mead",options=dict(maxiter=4000,xatol=1e-5,fatol=1e-3))
                if best is None or res.fun<best.fun: best=res
    tc,k,b,lr=best.x; X,f,m=chi2(best.x,P,True)
    rc=min(minimize(lambda th:chi2([th[0],th[1],th[2],np.log10(RHO)],P),[tc,k,bb],method="Nelder-Mead",options=dict(maxiter=3000)).fun for bb in [0.0,0.5,0.85,0.95])
    # density profile: 1-sigma range of rho (dchi2<1)
    prof=[]
    for l in np.arange(-2.5,1.6,0.1):
        v=min(minimize(lambda th:chi2([th[0],th[1],th[2],l],P),[tc,k,bb],method="Nelder-Mead",options=dict(maxiter=2000)).fun for bb in [0.0,0.6,0.9])
        prof.append((l,v))
    prof=np.array(prof); okp=prof[:,1]<X+1; okp2=prof[:,1]<X+4
    T14=(t[m<1].max()-t[m<1].min())*24 if (m<1).any() else 0
    n=len(t)
    out[f"P={P}"]=dict(tc=round(tc,4),k=round(k,4),Rp_Rearth=round(k*float(tic["rad"])*109.1,1),b=round(b,3),rho=round(10**lr,3),rho_tic=RHO,
        rho_1sig=[round(10**prof[okp,0].min(),3),round(10**prof[okp,0].max(),3)] if okp.any() else None,
        rho_2sig=[round(10**prof[okp2,0].min(),3),round(10**prof[okp2,0].max(),3)] if okp2.any() else None,
        depth_ppt=round((1-m.min())*1e3,2),T14_h=round(T14,2),dchi2_vs_flat=round(chi0-X,1),dBIC=round(chi0-(X+4*np.log(n)),1),dchi2_at_tic_rho=round(rc-X,2),sig_ppt=round(sig*1e3,2))
    print(AU,SEC,COL,out[f"P={P}"],flush=True)
    if P==P1:
        fig,ax=plt.subplots(figsize=(9,4)); base=f/m
        ax.plot((t-tc)*24,(y/base-1)*1e3,".",color="0.7",ms=2)
        nb=max(1,int(round((20/1440)/EXP))); nn=len(t)//nb
        ax.plot(((t-tc)*24)[:nn*nb].reshape(nn,nb).mean(1),((y/base-1)*1e3)[:nn*nb].reshape(nn,nb).mean(1),"k.")
        ax.plot((t-tc)*24,(m-1)*1e3,"r-"); ax.set_xlim(-12,12); ax.set_xlabel("hours from tc"); ax.set_ylabel("ppt")
        o=out[f"P={P}"]; ax.set_title(f"{AU} S{SEC} {COL}: depth {o['depth_ppt']} ppt, T14 {o['T14_h']} h, b {o['b']}, rho {o['rho']} (TIC {RHO:.2f}), dBIC {o['dBIC']}",fontsize=8)
        fig.tight_layout(); fig.savefig(f"figs/step6_fit_{AU}_S{SEC}.png",dpi=90)
json.dump(out,open(f"data/step6_fit_{AU}_S{SEC}.json","w"),indent=1)
