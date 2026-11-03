"""batman fit of the QLP KSPSAP S12 dip (the only product that shows it) at fixed trial periods.
Free: tc, k=Rp/Rs, b, log10 rho*, linear baseline (profiled). Circular. LD fixed u=(0.30,0.40) (approx. TESS band, 3400 K dwarf).
Profile: chi2 minimised over tc,k for each (b, log rho) grid point; report the rho* range with dchi2<4 vs catalog 6.17 rho_sun.
Also the same model on own TESScut photometry, fixing the QLP best-fit shape, to show what the pixels say."""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, json, batman, glob
from scipy.optimize import minimize
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
from lcio import load_all
G=6.674e-8; RS=1.408; RHO_CAT=6.17; TC0=1635.158
r=load_all(authors=["QLP"],sectors=[12])[0]
t,y=r["t"],r["KSPSAP_FLUX"].copy(); ok=(r["q"]==0)&np.isfinite(y)&(np.abs(t-TC0)<1.0)
t,y=t[ok],y[ok]/np.nanmedian(y[ok])
sig=1.4826*np.median(np.abs(y-np.median(y)))
def aRs(rho,P): return (G*rho*RS*(P*86400)**2/(3*np.pi))**(1/3)
def model(tc,k,b,lrho,P,tt):
    p=batman.TransitParams(); p.t0=tc; p.per=P; p.rp=k; a=aRs(10**lrho,P); p.a=a
    if b>=a: return None
    p.inc=np.degrees(np.arccos(b/a)); p.ecc=0; p.w=90; p.u=[0.30,0.40]; p.limb_dark="quadratic"
    return batman.TransitModel(p,tt,supersample_factor=7,exp_time=1800/86400).light_curve(p)
def chi2(th,b,lrho,P,tt=t,yy=y):
    tc,k=th
    if not(0.01<k<0.6 and abs(tc-TC0)<0.08): return 1e12
    m=model(tc,k,b,lrho,P,tt)
    if m is None: return 1e12
    A=np.vstack([m,m*(tt-TC0)]).T; c=np.linalg.lstsq(A,yy,rcond=None)[0]
    return np.sum(((yy-A@c)/sig)**2)
out={}
B=np.linspace(0,1.3,27); LR=np.linspace(-0.5,3.5,41)
for P in [130,400,648,1000]:
    C=np.full((len(B),len(LR)),np.inf)
    for i,b in enumerate(B):
        for j,lr in enumerate(LR):
            best=1e12
            for k0 in [0.12,0.2,0.35]:
                for tc0 in [1635.14,1635.16]:
                    res=minimize(chi2,[tc0,k0],args=(b,lr,P),method="Nelder-Mead",options=dict(xatol=1e-4,fatol=1e-3))
                    best=min(best,res.fun)
            C[i,j]=best
    cmin=C.min(); ib,jr=np.unravel_index(C.argmin(),C.shape)
    okr=(C-cmin<4).any(0); rr=10**LR[okr]
    # chi2 at catalog density, best b
    jc=np.argmin(np.abs(LR-np.log10(RHO_CAT))); dcat=C[:,jc].min()-cmin
    # chi2 of no transit
    A=np.vstack([np.ones_like(t),t-TC0]).T; c=np.linalg.lstsq(A,y,rcond=None)[0]; c0=np.sum(((y-A@c)/sig)**2)
    out[P]=dict(best_b=float(B[ib]),best_rho=float(10**LR[jr]),rho_range_dchi2lt4=[float(rr.min()),float(rr.max())],dchi2_at_catalog_rho=float(dcat),dchi2_vs_flat=float(c0-cmin))
    print(P,out[P])
# the best-fit implied duration for b=0 at catalog rho
for P in [130,648,1000]:
    a=aRs(RHO_CAT,P); T=P/np.pi*np.arcsin(np.sqrt((1+0.15)**2)/a)*24
    print(f"P={P} d: a/R*={a:.0f}, central T14 at catalog rho (k=0.15) = {T:.1f} h; b needed for 2 h ~ {np.sqrt(max(0,(1.15)**2-(1.15*2/T)**2)):.2f}")
    out[f"T14_central_P{P}"]=T
json.dump(out,open("data/step6_fit.json","w"),indent=1)
