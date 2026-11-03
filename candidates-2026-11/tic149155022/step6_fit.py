"""Face-value batman fit of the dip. usage: step6_fit.py SECTOR COLUMN TC P RS RHO_CAT EXPTIME_S
Free: tc, k; grid over b and log rho*; quadratic baseline profiled; circular; LD (0.32,0.25) ~TESS band for 6000-7000 K."""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, json, batman, sys
from scipy.optimize import minimize
from lcio import load_all
S=int(sys.argv[1]); COL=sys.argv[2]; TC0=float(sys.argv[3]); P=float(sys.argv[4]); RS=float(sys.argv[5]); RHO=float(sys.argv[6]); EXP=float(sys.argv[7])
G=6.674e-8
r=load_all(authors=["QLP"],sectors=[S])[0]
t,y=r["t"],r[COL].copy(); ok=(r["q"]==0)&np.isfinite(y)&(np.abs(t-TC0)<1.0); t,y=t[ok],y[ok]/np.nanmedian(y[ok])
sig=np.std(np.diff(y))/np.sqrt(2)
def aRs(rho): return (G*rho*1.41*(P*86400)**2/(3*np.pi))**(1/3)
def model(tc,k,b,lrho):
    p=batman.TransitParams(); p.t0=tc; p.per=P; p.rp=k; a=aRs(10**lrho); p.a=a
    if b>=a: return None
    p.inc=np.degrees(np.arccos(b/a)); p.ecc=0; p.w=90; p.u=[0.32,0.25]; p.limb_dark="quadratic"
    return batman.TransitModel(p,t,supersample_factor=5,exp_time=EXP/86400).light_curve(p)
def chi2(th,b,lrho):
    tc,k=th
    if not(0.01<k<0.6 and abs(tc-TC0)<0.1): return 1e12
    m=model(tc,k,b,lrho)
    if m is None: return 1e12
    A=np.vstack([m,m*(t-TC0),m*(t-TC0)**2]).T; c=np.linalg.lstsq(A,y,rcond=None)[0]; return np.sum(((y-A@c)/sig)**2)
B=np.linspace(0,1.2,13); LR=np.linspace(-2.5,1.5,21); C=np.full((len(B),len(LR)),np.inf); K=np.zeros_like(C); TT=np.zeros_like(C)
for i,b in enumerate(B):
    for j,lr in enumerate(LR):
        best=(1e12,0,0)
        for k0 in [0.07,0.1,0.15]:
            res=minimize(chi2,[TC0,k0],args=(b,lr),method="Nelder-Mead",options=dict(xatol=1e-4,fatol=1e-3))
            if res.fun<best[0]: best=(res.fun,res.x[1],res.x[0])
        C[i,j],K[i,j],TT[i,j]=best
cmin=C.min(); ib,jr=np.unravel_index(C.argmin(),C.shape)
A=np.vstack([np.ones_like(t),t-TC0,(t-TC0)**2]).T; c=np.linalg.lstsq(A,y,rcond=None)[0]; c0=np.sum(((y-A@c)/sig)**2)
okr=(C-cmin<4).any(0); jc=np.argmin(np.abs(LR-np.log10(RHO)))
a=aRs(10**LR[jr]); b=B[ib]; k=K[ib,jr]
T14=P/np.pi*np.arcsin(np.sqrt(max((1+k)**2-b**2,0))/a/np.sin(np.arccos(b/a)))*24
a0=aRs(RHO); Tc=P/np.pi*np.arcsin((1+k)/a0)*24
out=dict(sector=S,col=COL,P=P,best=dict(b=float(b),rho=float(10**LR[jr]),k=float(k),depth_ppt=float(k**2*1e3),T14_h=float(T14),tc=float(TT[ib,jr])),
         rho_range_dchi2lt4=[float(10**LR[okr].min()),float(10**LR[okr].max())],dchi2_at_catalog_rho=float(C[:,jc].min()-cmin),dchi2_vs_flat=float(c0-cmin),
         central_T14_at_catalog_rho_h=float(Tc),Rp_earth_at_RS=float(k*RS*109.1))
print(json.dumps(out,indent=1)); json.dump(out,open(f"data/step6_fit_s{S}.json","w"),indent=1)
