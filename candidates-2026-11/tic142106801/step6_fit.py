"""Face-value batman fits (P fixed at 2187.45 d, circular, quadratic LD u=0.40,0.25) of the two events as the vet saw them:
QLP S7 KSPSAP and QLP S87 DET_FLUX (quality 0, +-1 d, linear baseline). Free: tc, k, b, a/R*. Then rho* implied vs Gaia FLAME
(0.265 rho_sun), and T14 for a central transit of the real star."""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, json, batman
from scipy.optimize import least_squares
from lcio import load_all
from common import TC, TC2
P=2187.45; out={}
def model(p,t):
    tc,k,b,ar,c0,c1=p
    pm=batman.TransitParams(); pm.t0=tc; pm.per=P; pm.rp=k; pm.a=ar; pm.inc=np.degrees(np.arccos(min(b/ar,1))); pm.ecc=0; pm.w=90; pm.u=[0.40,0.25]; pm.limb_dark='quadratic'
    return batman.TransitModel(pm,t,supersample_factor=5,exp_time=np.median(np.diff(t))).light_curve(pm)*(c0+c1*(t-tc))
for name,s,col,tc in [('S7_QLP_KSPSAP',7,'KSPSAP_FLUX',TC),('S87_QLP_DET',87,'DET_FLUX',TC2)]:
    r=[x for x in load_all() if x['author']=='QLP' and x['sector']==s][0]
    t=r['t']; f=r['flux'][col]; g=(r['q']==0)&np.isfinite(f)&(np.abs(t-tc)<1.0); t=t[g]; f=f[g]/np.median(f[g])
    best=None
    for b0 in [0.1,0.5,0.9]:
        for ar0 in [100,300,800]:
            p0=[tc,0.07,b0,ar0,1,0]
            try:
                rr=least_squares(lambda p: model(p,t)-f, p0, bounds=([tc-0.2,0.01,0,5,0.9,-1],[tc+0.2,0.5,1.5,3000,1.1,1]))
            except Exception as e: continue
            if best is None or rr.cost<best.cost: best=rr
    tc_,k,b,ar,_,_=best.x
    rho=3*np.pi*ar**3/(6.674e-8*(P*86400)**2)/1.41
    T14=P/np.pi*np.arcsin(np.sqrt(max((1+k)**2-b**2,0))/ar/np.sin(np.arccos(min(b/ar,1))))*24
    out[name]=dict(tc=round(tc_,4),k=round(k,4),depth_ppt=round(k**2*1e3,2),b=round(b,3),a_Rs=round(ar,1),T14_h=round(T14,2),rho_star_rho_sun=round(rho,4),
                   rms_ppt=round(float(np.std(best.fun))*1e3,2))
    print(name,out[name])
# central T14 for the real star
R=1.53; M=0.95; rho=M/R**3
for p in [8,30,100,1093.7,2187.45]:
    a=(6.674e-8*M*1.989e33*(p*86400)**2/(4*np.pi**2))**(1/3)/(R*6.957e10)
    out[f'T14_central_P{p}_h']=round(p/np.pi*np.arcsin(1/a)*24,1)
out['rho_flame']=round(rho,3)
out['Rp_for_4.4ppt_Rearth']=round(np.sqrt(4.4e-3)*R*109.1,1)
print(out)
json.dump(out,open('data/step6_fit.json','w'),indent=1)
