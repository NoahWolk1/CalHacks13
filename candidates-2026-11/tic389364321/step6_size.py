"""Host luminosity/radius in the LMC, implied companion size, expected transit durations, and a face-value batman fit."""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, json, batman
from scipy.optimize import least_squares
from lcio import load_all
from common import TC, DUR
out={}
# --- star (LMC: DM 18.477 Pietrzynski+2019; Gaia G, extinction from Gaia GSP-Phot / ESP-HS)
G=11.997; DM=18.477
for lab,AG,T in [("GSP-Phot",0.696,22711.),("ESP-HS",0.597,19576.)]:
    MG=G-DM-AG
    # BC_G for hot stars: approx BC_V (Flower/Torres) since G-V ~ 0 for BP-RP_0 ~ -0.3; take BC=-2.2 (22.7 kK) / -1.9 (19.6 kK)
    BC=-2.2 if T>21000 else -1.9
    Mbol=MG+BC; L=10**((4.74-Mbol)/2.5); R=np.sqrt(L)*(5772/T)**2
    out[lab]=dict(M_G=round(MG,2),BC=BC,Mbol=round(Mbol,2),logL=round(np.log10(L),2),R_sun=round(R,1),Teff=T)
out["gaia_gspphot_radius_rescaled_to_LMC"]=round(7.3702*49590/8143.354,1)   # GSP-Phot used d=8.1 kpc
R=np.mean([out[k]["R_sun"] for k in ("GSP-Phot","ESP-HS")]); out["R_adopt"]=round(R,1)
M=10**2.60*(R*6.957e10)**2/6.674e-8/1.989e33; out["M_from_logg2.60"]=round(M,1)
Madopt=25.0; out["M_adopt"]=Madopt
rho=Madopt/R**3; out["rho_star_solar"]=rho
# --- companion size for the measured depths (dilution: none assumed beyond SPOC's)
for d in [7.57,8.2,10.0,15.8]:
    k=np.sqrt(d*1e-3); out[f"Rc_for_{d}ppt"]=dict(k=round(k,3),R_sun=round(k*R,2),R_jup=round(k*R*9.73,1))
# --- durations: central-transit T14 ~ (R*P/(pi a)), a from Kepler
def a_rs(P): return (6.674e-8*Madopt*1.989e33*(P*86400)**2/(4*np.pi**2))**(1/3)/(R*6.957e10)
for P in [10.9,30,100,596,1270]:
    ars=a_rs(P); T14=P/np.pi*np.arcsin(np.sqrt((1+0.1)**2)/ars)*24 if ars>1.1 else np.nan
    # impact parameter needed for an 8 h chord: T = P/pi * asin( sqrt((1+k)^2-b^2)/ars ) -> b
    chord=np.sin(np.pi*(8/24)/P)*ars; b8=np.sqrt(max((1.1)**2-chord**2,0))
    out[f"P{P}"]=dict(a_over_Rs=round(ars,2),T14_central_h=round(T14,1),b_needed_for_8h=round(b8,3))
out["P_contact_d"]=round(2*np.pi*np.sqrt((R*6.957e10)**3/(6.674e-8*Madopt*1.989e33))/86400,2)
# --- face-value batman fit (SPOC SAP S31, +-1 d, quadratic baseline), P fixed 596 d
r=[x for x in load_all() if x['author']=='SPOC' and x['sector']==31][0]
g=(r['q']==0)&np.isfinite(r['SAP_FLUX'])&(np.abs(r['t']-TC)<1.0); t=r['t'][g]; f=r['SAP_FLUX'][g]/np.median(r['SAP_FLUX'][g])
tb=np.arange(t.min(),t.max(),1/96); i=np.digitize(t,tb); u=[k for k in np.unique(i) if (i==k).sum()>3]
T=np.array([t[i==k].mean() for k in u]); F=np.array([f[i==k].mean() for k in u])
P=596.
def model(p):
    tc,k,b,ars,c0,c1,c2=p
    pm=batman.TransitParams(); pm.t0=tc; pm.per=P; pm.rp=k; pm.a=ars; pm.inc=np.degrees(np.arccos(min(b/ars,1))); pm.ecc=0; pm.w=90; pm.u=[0.2,0.2]; pm.limb_dark="quadratic"
    return batman.TransitModel(pm,T).light_curve(pm)*(c0+c1*(T-TC)+c2*(T-TC)**2)
fits=[]
for b0 in [0.1,0.5,0.9]:
    for a0 in [50,150,400]:
        try:
            s=least_squares(lambda p:model(p)-F,[TC,0.09,b0,a0,1,0,0],bounds=([TC-0.2,0.01,0,2,0.9,-1,-1],[TC+0.2,0.5,1.5,3000,1.1,1,1]))
            fits.append(s)
        except Exception: pass
s=min(fits,key=lambda s:s.cost); tc,k,b,ars,*_=s.x
rho_fit=3*np.pi*ars**3/(6.674e-8*(P*86400)**2)/1.41
res=F-model(s.x)
# BIC vs pure quadratic
A=np.vstack([np.ones_like(T),T-TC,(T-TC)**2]).T; c=np.linalg.lstsq(A,F,rcond=None)[0]; r0=F-A@c
n=len(F); sig=np.std(res)
bic=lambda rr,kp: np.sum(rr**2)/sig**2+kp*np.log(n)
out["batman_P596"]=dict(tc=round(tc,4),k=round(k,3),depth_ppt=round(k**2*1e3,2),b=round(b,3),a_over_Rs=round(ars,1),rho_star_solar=round(rho_fit,4),
                       rho_ratio_to_supergiant=round(rho_fit/rho,1),rms_ppt=round(sig*1e3,2),dBIC_quadratic_minus_transit=round(bic(r0,3)-bic(res,7),1),
                       T14_h=round(P/np.pi*np.arcsin(np.sqrt(max((1+k)**2-b**2,0))/ars)*24,1))
print(json.dumps(out,indent=1)); json.dump(out,open("data/step6_size.json","w"),indent=1)
