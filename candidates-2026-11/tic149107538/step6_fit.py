"""Baseline: harmonic model fitted jointly with an 8 h trapezoid; batman then fitted to flux/baseline.
(a) Expected central-transit duration for the Gaia FLAME host (R 2.73, M 1.19) vs period, and the periods allowed
by the single event given S61-69 + S96 coverage. (b) batman fit of the dip on the harmonic-model residuals (S67 orbit 1,
event masked when fitting the baseline), P fixed at 30 d, giving the implied stellar density. (c) fold of the harmonic
residuals of S61-69 on P_rot = 6.104 d (a synchronised binary's eclipses would show here)."""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, json, batman
from scipy.optimize import least_squares
from lcio import load_all
from measure import trapezoid
from common import TC, DUR
P=6.104; R=2.73; M=1.19; G=6.674e-11; Rs=6.957e8; Ms=1.989e30
rho_star=M/R**3
out=dict(rho_star_solar=round(rho_star,4))
def T14(Pd,b=0,k=0.04):
    a=(G*M*Ms*(Pd*86400)**2/(4*np.pi**2))**(1/3)/(R*Rs)
    return Pd*24/np.pi*np.arcsin(np.sqrt((1+k)**2-b**2)/a/np.sin(np.arccos(b/a))) if (1+k)>b else 0, a
out["T14_central_h"]={str(p):round(T14(p)[0],1) for p in [3,5,10,20,30,60,100,200,500]}
out["a_over_R"]={str(p):round(T14(p)[1],1) for p in [3,10,30,100]}
# b needed for 8 h at several P
bneed={}
for p in [10,30,100,200]:
    bs=np.linspace(0,1.03,2000); d=[T14(p,b)[0] for b in bs]; i=np.argmin(np.abs(np.array(d)-8)); bneed[str(p)]=round(bs[i],3)
out["b_for_8h"]=bneed
# coverage: allowed periods (no other transit in TESS-SPOC/SPOC data with q==0 coverage)
T=[]
for r in load_all(authors=["TESS-SPOC","SPOC"]):
    g=(r['q']==0)&np.isfinite(r['SAP_FLUX']); T+=list(r['t'][g])
T=np.sort(np.array(T)); allowed=[]
for p in np.arange(1,1000,0.01):
    n=np.round((T-TC)/p); ph=np.abs(T-TC-n*p); hit=np.unique(n[(ph<DUR/2*0.5)&(n!=0)])
    if len(hit)==0: allowed.append(p)
allowed=np.array(allowed); out["min_allowed_P_d"]=round(float(allowed.min()),2) if len(allowed) else None
out["frac_allowed_1_100d"]=round(float(((allowed<100)).sum()/9900),3)
print(json.dumps(out,indent=1))
# (b) fit
def harm(t):
    tm=t.mean(); x=(t-tm)/(t.max()-t.min()); cols=[x**k for k in range(3)]
    for h in range(1,4):
        for a in (np.sin,np.cos):
            b=a(2*np.pi*h*(t-tm)/P); cols+=[b,b*x]
    return np.vstack(cols).T
r=[x for x in load_all(authors=["TESS-SPOC"],sectors=[67])][0]
t=r['t']; f=r['SAP_FLUX']; g=(r['q']==0)&np.isfinite(f)&(t<3134.5); t=t[g]; y=f[g]/np.median(f[g])
H=harm(t); sj=trapezoid(t,TC,DUR); AJ=np.column_stack([H,-sj]); c,*_=np.linalg.lstsq(AJ,y,rcond=None); yd=y/(H@c[:-1])  # baseline from the joint fit (masking the trough leaves it unconstrained, step6_baseline.py)
w=np.abs(t-TC)<1.0; t1,y1=t[w],yd[w]
Pf=30.0
def model(p):
    tc,k,ar,b=p
    pr=batman.TransitParams(); pr.t0=tc; pr.per=Pf; pr.rp=k; pr.a=ar; pr.inc=np.degrees(np.arccos(min(b/ar,1))); pr.ecc=0; pr.w=90; pr.u=[0.5,0.2]; pr.limb_dark="quadratic"
    return batman.TransitModel(pr,t1).light_curve(pr)
inb=np.abs(t1-TC)<DUR/2; out["box_mean_residual_ppt"]=round(float((1-np.mean(y1[inb]))*1e3-(1-np.mean(y1[~inb]))*1e3),3)
fits=[]
for ar0 in [5,10,15,25,40]:
  for b0 in [0.0,0.5,0.8,0.95]:
    s=least_squares(lambda p: model(p)-y1,[TC,0.03,ar0,b0],bounds=([TC-0.2,0.005,2,0],[TC+0.2,0.3,200,1.3]),x_scale=[0.01,0.01,5,0.1])
    fits.append((np.sum(s.fun**2),s.x))
fits.sort(key=lambda z:z[0]); chi,(tc,k,ar,b)=fits[0]
chi0=np.sum((y1-1)**2)
rho=3*np.pi*ar**3/(G*(Pf*86400)**2)/1410.
dur=T14(Pf)[0]
out["batman_fit"]=dict(tc=round(tc,4),k=round(k,4),a_over_R=round(ar,2),b=round(b,3),depth_ppt=round(k**2*1e3,3),
    rho_implied_solar=round(rho,4),rho_ratio_to_host=round(rho/rho_star,2),dchi2_vs_flat=round(float(chi0-chi)/np.var(y1-model(fits[0][1])),1),
    T14_h=round(Pf*24/np.pi*np.arcsin(np.sqrt(max((1+k)**2-b**2,0))/ar),2))
print(out["batman_fit"])
# (c) fold on P_rot
RES=[];TT=[]
for r in load_all(authors=["TESS-SPOC"]):
    t=r['t']; f=r['SAP_FLUX']; g=(r['q']==0)&np.isfinite(f); t=t[g]; y=f[g]/np.median(f[g])-1
    br=np.where(np.diff(t)>0.5)[0]+1
    for idx in np.split(np.arange(len(t)),br):
        if len(idx)<300: continue
        H=harm(t[idx]); c,*_=np.linalg.lstsq(H,y[idx],rcond=None); RES+=list(y[idx]-H@c); TT+=list(t[idx])
RES=np.array(RES);TT=np.array(TT); ph=np.mod((TT-TC)/P+0.5,1)-0.5
bins=np.linspace(-0.5,0.5,101); idx=np.digitize(ph,bins)
pb=np.array([np.median(RES[idx==i]) for i in range(1,len(bins))])
out["fold_Prot"]=dict(min_ppt=round(float(pb.min()*1e3),3),max_ppt=round(float(pb.max()*1e3),3),rms_bins_ppt=round(float(np.std(pb)*1e3),3),
                      phase_of_min=round(float(bins[np.argmin(pb)]+0.005),3),bin_at_event=round(float(pb[50]*1e3),3))
print(out["fold_Prot"])
json.dump(out,open("data/step6_fit.json","w"),indent=1,default=float)
