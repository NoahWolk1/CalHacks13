"""Face-value batman fit of the S39 event (QLP SAP, and own TESScut r=2 px plane-bkg photometry), P fixed (617 d; also 100 d),
quadratic baseline, circular orbit, u=(0.50,0.20). Implied stellar density vs TIC/Gaia, and expected central T14."""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, json, glob, batman, lightkurve as lk
from scipy.optimize import least_squares
from astropy.coordinates import SkyCoord; import astropy.units as u
from lcio import load_all
from common import RA, DEC, TC, DUR
G=6.674e-11; RHO_SUN=1408.
def lc_model(p,t,P):
    tc,k,b,ar=p[:4]
    pm=batman.TransitParams(); pm.t0=tc; pm.per=P; pm.rp=k; pm.a=ar; pm.inc=np.degrees(np.arccos(min(b/ar,1))); pm.ecc=0; pm.w=90; pm.u=[0.5,0.2]; pm.limb_dark='quadratic'
    m=batman.TransitModel(pm,t,supersample_factor=5,exp_time=600/86400.); return m.light_curve(pm)
def fit(t,f,P):
    w=np.abs(t-TC)<1; t=t[w]; f=f[w]/np.median(f[w])
    best=None
    for b0 in [0.1,0.5,0.8,0.95]:
        for ar0 in [50,150,400]:
            p0=[TC,0.06,b0,ar0,1,0,0]
            res=lambda p: (lc_model(p,t,P)*(p[4]+p[5]*(t-TC)+p[6]*(t-TC)**2)-f)
            try: r=least_squares(res,p0,bounds=([TC-0.1,0.005,0,2,0.9,-1,-1],[TC+0.1,0.5,1.5,5000,1.1,1,1]))
            except Exception as e: continue
            if best is None or r.cost<best.cost: best=r
    p=best.x; tc,k,b,ar=p[:4]
    rho=3*np.pi/(G*(P*86400)**2)*ar**3/RHO_SUN
    T14=P/np.pi*np.arcsin(np.sqrt((1+k)**2-b**2)/ar/np.sin(np.arccos(b/ar)))*24 if (1+k)>b else 0
    chi=2*best.cost; n=len(t)
    # flat model chi2
    A=np.vstack([np.ones_like(t),t-TC,(t-TC)**2]).T; c,*_=np.linalg.lstsq(A,f,rcond=None); chi0=np.sum((f-A@c)**2)
    sig2=chi/(n-7)
    return dict(P=P,tc=float(tc),k=float(k),b=float(b),a_R=float(ar),depth_ppt=float(k*k*1e3),T14_h=float(T14),rho_star_rhosun=float(rho),
                dchi2_vs_flat_over_sig2=float((chi0-chi)/sig2),n=int(n))
out={}
q=[r for r in load_all() if r['author']=='QLP' and r['sector']==39][0]; g=(q['q']==0)&np.isfinite(q['SAP_FLUX'])
tpf=lk.read(glob.glob("data/tesscut/tesscut/tess-s0039*.fits")[0]); t2=tpf.time.value; F=tpf.flux.value.astype(float); fin=np.all(np.isfinite(F),axis=(1,2))
xt,yt=[float(v) for v in tpf.wcs.world_to_pixel(SkyCoord(RA*u.deg,DEC*u.deg))]; Y,X=np.mgrid[:F.shape[1],:F.shape[2]]; rr=np.hypot(X-xt,Y-yt)
med=np.nanmedian(F[fin],0); faint=(med<np.nanpercentile(med,40))&(rr>3)
A=np.vstack([np.ones(faint.sum()),X[faint],Y[faint]]).T; co=np.linalg.lstsq(A,np.nan_to_num(F[:,faint]).T,rcond=None)[0]; bk=co[0]+co[1]*xt+co[2]*yt
own=np.nansum(F[:,rr<=2.0]-bk[:,None],1)
for P in [617.,100.]:
    out[f'QLP_SAP_P{int(P)}']=fit(q['t'][g],q['SAP_FLUX'][g],P); print(out[f'QLP_SAP_P{int(P)}'])
    out[f'own_r2_P{int(P)}']=fit(t2[fin],own[fin],P); print(out[f'own_r2_P{int(P)}'])
# star: TIC rho 0.79; Gaia FLAME R 0.994, M from TIC 0.81
R,M=0.994,0.81; rho=M/R**3
out['rho_star_adopted']=rho
for P in [24,100,617,1240]:
    a=(G*M*1.989e30*(P*86400)**2/(4*np.pi**2))**(1/3)/(R*6.957e8)
    out[f'T14_central_P{P}_h']=float(P/np.pi*np.arcsin(1/a)*24)
print({k:v for k,v in out.items() if k.startswith('T14') or k.startswith('rho')})
json.dump(out,open('data/step6_fit.json','w'),indent=1)
