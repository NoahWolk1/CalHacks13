"""Host (O8.5 II in the LMC) luminosity, radius and density; the body needed for the depth; central-transit durations;
a free trapezoid fit (depth, duration, centre) to SPOC PDCSAP S3 and the stellar density a 6 h b=0 transit implies."""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, json
from scipy.optimize import least_squares
from lcio import load_all
from measure import trapezoid
from common import TC
out={}
G=13.1834; DM=18.477
for lab,AG,T,BC in [("GSP-Phot",0.4795,32781.,-3.15),("O8.5II calib (Martins+2005, 33 kK)",0.48,33000.,-3.17)]:
    MG=G-DM-AG; Mbol=MG+BC; L=10**((4.74-Mbol)/2.5); R=np.sqrt(L)*(5772/T)**2
    out[lab]=dict(M_G=round(MG,2),logL=round(np.log10(L),2),R_sun=round(R,1))
out["gspphot_radius_rescaled_to_LMC"]=round(4.8524*49590/14163.8,1)
R=17.0; M=30.0; out["R_adopt"]=R; out["M_adopt"]=M; rho=M/R**3; out["rho_star_solar"]=round(rho,5)
for d in [1.71/0.0536/1e0, 25.6, 39.1]:
    k=np.sqrt(d*1e-3); out[f"body_for_{round(d,1)}ppt"]=dict(R_sun=round(k*R,2),R_jup=round(k*R*9.73,1))
def a_rs(P): return (6.674e-8*M*1.989e33*(P*86400)**2/(4*np.pi**2))**(1/3)/(R*6.957e10)
for P in [10,30,100,635,2541]:
    ars=a_rs(P); out[f"P{P}"]=dict(a_over_Rs=round(ars,1),T14_central_h=round(P/np.pi*np.arcsin(min(1.1/ars,1))*24,1))
out["P_contact_d"]=round(2*np.pi*np.sqrt((R*6.957e10)**3/(6.674e-8*M*1.989e33))/86400,2)
# free trapezoid fit on SPOC PDCSAP S3 (+-1 d, quadratic baseline), 20-min bins
r=[x for x in load_all() if x['author']=='SPOC' and x['sector']==3][0]
g=(r['q']==0)&np.isfinite(r['PDCSAP_FLUX'])&(np.abs(r['t']-TC)<1); t=r['t'][g]; f=r['PDCSAP_FLUX'][g]/np.median(r['PDCSAP_FLUX'][g])
tb=np.arange(t.min(),t.max(),1/72); i=np.digitize(t,tb); u=[k for k in np.unique(i) if (i==k).sum()>3]
T=np.array([t[i==k].mean() for k in u]); F=np.array([f[i==k].mean() for k in u])
def mod(p):
    tc,dep,dur,ing,c0,c1,c2=p; return (c0+c1*(T-TC)+c2*(T-TC)**2)*(1-dep*trapezoid(T,tc,dur,ing))
fits=[least_squares(lambda p:mod(p)-F,[TC,0.03,d0,0.2,1,0,0],bounds=([TC-0.2,0,0.05,0.01,0.9,-1,-1],[TC+0.2,0.2,1.0,0.5,1.1,1,1])) for d0 in (0.15,0.25,0.4)]
s=min(fits,key=lambda s:s.cost); tc,dep,dur,ing=s.x[:4]; res=F-mod(s.x)
A=np.vstack([np.ones_like(T),T-TC,(T-TC)**2]).T; c=np.linalg.lstsq(A,F,rcond=None)[0]; r0=F-A@c
sig=np.std(res); n=len(F); bic=lambda rr,kp: np.sum(rr**2)/sig**2+kp*np.log(n)
out["trapezoid_fit_PDCSAP_S3"]=dict(tc=round(tc,3),depth_ppt=round(dep*1e3,1),T14_h=round(dur*24,1),ingress_frac=round(ing,2),rms_20min_ppt=round(sig*1e3,1),
                                    dBIC_flat_minus_trapezoid=round(bic(r0,3)-bic(res,7),1))
# density implied by a b=0 transit of that duration at P (rho ~ 3 pi / (G P^2) (P/(pi T14))^3 )
for P in [10,100,2541]:
    ars=P/(np.pi*dur); rho_fit=3*np.pi*ars**3/(6.674e-8*(P*86400)**2)/1.41
    out[f"rho_implied_P{P}_solar"]=round(rho_fit,3); out[f"rho_ratio_P{P}"]=round(rho_fit/rho,0)
print(json.dumps(out,indent=1)); json.dump(out,open("data/step6_size.json","w"),indent=1)
