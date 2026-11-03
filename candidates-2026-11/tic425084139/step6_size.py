"""Host size in the LMC (Sk -67 171, B8Ia), implied companion size, central-transit durations at the vet's period and its aliases,
and a face-value batman fit of the S30 SPOC SAP event (P = 1635.56 d)."""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, json, batman
from scipy.optimize import least_squares
from lcio import load_all
from common import TC, DUR
out={}
G=12.068; DM=18.477; AG=0.410     # Gaia G; LMC DM (Pietrzynski+2019); A_G from Gaia ESP-HS
for lab,T,BC in [("ESP-HS 14.9 kK",14864.,-1.25),("B8Ia typical 12.5 kK",12500.,-0.85)]:
    MG=G-DM-AG; Mbol=MG+BC; L=10**((4.74-Mbol)/2.5); R=np.sqrt(L)*(5772/T)**2
    out[lab]=dict(M_G=round(MG,2),BC=BC,logL=round(np.log10(L),2),R_sun=round(R,1),Teff=T)
R=np.mean([out[k]["R_sun"] for k in out]); out["R_adopt"]=round(R,1)
out["M_from_logg2.50"]=round(10**2.50*(R*6.957e10)**2/6.674e-8/1.989e33,1); M=20.0; out["M_adopt"]=M
out["rho_star_solar"]=M/R**3
for d in [2.6,5.4,7.4]:
    k=np.sqrt(d*1e-3); out[f"Rc_for_{d}ppt"]=dict(k=round(k,3),R_sun=round(k*R,2),R_jup=round(k*R*9.73,1))
def a_rs(P): return (6.674e-8*M*1.989e33*(P*86400)**2/(4*np.pi**2))**(1/3)/(R*6.957e10)
for P in [408.89,545.19,817.78,1635.56]:
    ars=a_rs(P); T14=P/np.pi*np.arcsin(1.07/ars)*24; chord=np.sin(np.pi*(6/24)/P)*ars; b6=np.sqrt(max(1.07**2-chord**2,0))
    out[f"P{P}"]=dict(a_over_Rs=round(ars,1),T14_central_h=round(T14,1),b_needed_for_6h=round(b6,3))
r=[x for x in load_all(["SPOC"]) if x['sector']==30][0]
g=(r['q']==0)&np.isfinite(r['SAP_FLUX'])&(np.abs(r['t']-TC)<1.0); t=r['t'][g]; f=r['SAP_FLUX'][g]/np.median(r['SAP_FLUX'][g])
tb=np.arange(t.min(),t.max(),1/96); i=np.digitize(t,tb); u=[k for k in np.unique(i) if (i==k).sum()>3]
T=np.array([t[i==k].mean() for k in u]); F=np.array([f[i==k].mean() for k in u]); P=1635.56
def model(p):
    tc,k,b,ars,c0,c1,c2=p
    pm=batman.TransitParams(); pm.t0=tc; pm.per=P; pm.rp=k; pm.a=ars; pm.inc=np.degrees(np.arccos(min(b/ars,1))); pm.ecc=0; pm.w=90; pm.u=[0.2,0.2]; pm.limb_dark="quadratic"
    return batman.TransitModel(pm,T).light_curve(pm)*(c0+c1*(T-TC)+c2*(T-TC)**2)
fits=[]
for b0 in [0.1,0.5,0.9]:
    for a0 in [100,500,1500]:
        try: fits.append(least_squares(lambda p:model(p)-F,[TC,0.06,b0,a0,1,0,0],bounds=([TC-0.2,0.01,0,2,0.9,-1,-1],[TC+0.2,0.5,1.5,5000,1.1,1,1])))
        except Exception: pass
s=min(fits,key=lambda s:s.cost); tc,k,b,ars,*_=s.x
rho_fit=3*np.pi*ars**3/(6.674e-8*(P*86400)**2)/1.41; res=F-model(s.x)
A=np.vstack([np.ones_like(T),T-TC,(T-TC)**2]).T; c=np.linalg.lstsq(A,F,rcond=None)[0]; r0=F-A@c; n=len(F); sig=np.std(res)
bic=lambda rr,kp: np.sum(rr**2)/sig**2+kp*np.log(n)
out["batman_P1635"]=dict(tc=round(tc,4),k=round(k,3),depth_ppt=round(k**2*1e3,2),b=round(b,3),a_over_Rs=round(ars,1),rho_star_solar=round(rho_fit,4),
    rho_ratio_to_supergiant=round(rho_fit/out["rho_star_solar"],0),dBIC_quadratic_minus_transit=round(bic(r0,3)-bic(res,7),1),
    T14_h=round(P/np.pi*np.arcsin(np.sqrt(max((1+k)**2-b**2,0))/ars)*24,1))
print(json.dumps(out,indent=1)); json.dump(out,open("data/step6_size.json","w"),indent=1)
