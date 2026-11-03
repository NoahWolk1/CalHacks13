"""batman fits. S98 dip with P=TOI-220 b; S4 dip with P=518 d (shortest duo alias) and 2592 d. Free tc, rp, b, a/R*; report implied rho*."""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, json, batman
from scipy.optimize import least_squares
from lcio import load_all
from measure import segments
G=6.674e-8; RHOSUN=1.41
def rho_from_aR(aR,P): return 3*np.pi*aR**3/(G*(P*86400)**2)/RHOSUN
lcs=load_all(); out={}
for lab,s,tc0,P,win in [("S98 vs TOI-220b",98,4009.728,10.6953065,0.6),("S4 P=518",4,1417.10,518.5,0.9),("S4 P=2592",4,1417.10,2592.5,0.9)]:
    r=[x for x in lcs if x['sector']==s and x['author']=='SPOC'][0]
    t=r['t']; f=r['PDCSAP_FLUX']; g=(r['q']==0)&np.isfinite(f)&(np.abs(t-tc0)<win)
    t=t[g]; f=f[g]/np.nanmedian(f[g]); segs=segments(t)
    pm=batman.TransitParams(); pm.per=P; pm.ecc=0; pm.w=90; pm.u=[0.45,0.2]; pm.limb_dark="quadratic"; pm.t0=tc0; pm.rp=.03; pm.a=20; pm.inc=89
    m=batman.TransitModel(pm,t,supersample_factor=3,exp_time=120/86400)
    def model(p):
        tc,rp,b,laR=p[:4]; aR=10**laR; pm.t0=tc; pm.rp=rp; pm.a=aR; pm.inc=np.degrees(np.arccos(min(b/aR,1)))
        tr=m.light_curve(pm); base=np.zeros_like(t)
        k=4
        for idx in segs:
            base[idx]=p[k]+p[k+1]*(t[idx]-tc0); k+=2
        return tr*base
    best=None
    for laR0 in ([np.log10(22)] if P<20 else [np.log10(150),np.log10(300),np.log10(800)]):
        for b0 in [0.2,0.6,0.9]:
            p0=[tc0,0.03,b0,laR0]+[1,0]*len(segs)
            lo=[tc0-0.2,0.005,0,0.5]+[0.9,-1]*len(segs); hi=[tc0+0.2,0.2,1.2,4]+[1.1,1]*len(segs)
            sol=least_squares(lambda p:(f-model(p)),p0,bounds=(lo,hi))
            if best is None or sol.cost<best.cost: best=sol
    p=best.x; aR=10**p[3]; b=p[2]
    J=best.jac; cov=np.linalg.pinv(J.T@J)*np.var(best.fun); e=np.sqrt(np.diag(cov))
    T14=P/np.pi*np.arcsin(np.sqrt((1+p[1])**2-b**2)/aR/np.sin(np.arccos(b/aR)))*24 if (1+p[1])>b else np.nan
    o=dict(tc=p[0],tc_err=e[0],rp=p[1],rp_err=e[1],b=b,aR=aR,rho_star_solar=rho_from_aR(aR,P),T14_h=T14,depth_ppt=p[1]**2*1e3,chi2=2*best.cost/np.var(best.fun))
    out[lab]=o; print(lab,{k:(round(v,4) if isinstance(v,float) else v) for k,v in o.items()})
json.dump(out,open("data/step6_fit.json","w"),indent=1,default=float)
print("TIC rho* = 1.31 rho_sun")
