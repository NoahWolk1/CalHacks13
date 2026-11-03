"""Fixed-epoch 6 h dip on top of baseline + flare model (SAP, q=0); errors from sliding the same fixed dip over the rest of the window residuals."""
import numpy as np, json
from scipy.optimize import least_squares
from lcio import load_all
from measure import trapezoid
def flare(t,tp,fwhm,amp):
    x=(t-tp)/fwhm; f=np.zeros_like(t)
    r=(x>-1)&(x<=0); f[r]=1+1.941*x[r]-0.175*x[r]**2-2.246*x[r]**3-1.125*x[r]**4
    d=x>0; f[d]=0.6890*np.exp(-1.600*x[d])+0.3030*np.exp(-0.2783*x[d])
    return amp*f
EV={65:(3084.74,[3084.45,3084.58]),97:(3979.76,[3979.40])}
out={}
for sec,(tc,fl) in EV.items():
  for col in ["SAP_FLUX","SYS_RM_FLUX"]:
    r=load_all(sectors=[sec])[0]; t=r["t"]; f=r[col]
    for W in [1.5,2.5]:
        g=np.isfinite(t)&np.isfinite(f)&(r["q"]==0)&(np.abs(t-tc)<W); tt=t[g]; y=f[g]/np.nanmedian(f[g]); t0=tt.mean(); npoly=4 if W<2 else 6
        def model(p,tcd,dip=True):
            m=sum(p[i]*((tt-t0)/W)**i for i in range(npoly))
            for j in range(len(fl)): m=m+flare(tt,p[npoly+3*j],abs(p[npoly+3*j+1]),p[npoly+3*j+2])
            return m-(p[-1]*trapezoid(tt,tcd,0.25) if dip else 0)
        p0=[1]+[0]*(npoly-1)+sum([[x,0.05,0.02] for x in fl],[])+[0.0]
        s=least_squares(lambda p:model(p,tc)-y,p0); d=s.x[-1]
        J=s.jac; rr=s.fun; sw=np.sqrt(np.linalg.pinv(J.T@J)[-1,-1]*np.var(rr))
        # injection-free empirical scatter: same fixed-dip fit at offsets away from the flare
        alt=[]
        for dt in np.arange(-W+0.3,W-0.3,0.05):
            if abs(dt)<0.5 or (trapezoid(tt,tc+dt,0.25)>0.5).sum()<0.7*(0.25*86400/200): continue
            s2=least_squares(lambda p:model(p,tc+dt)-y,s.x); alt.append(s2.x[-1])
        alt=np.array(alt); se=1.4826*np.median(np.abs(alt-np.median(alt)))
        key=f"S{sec}_{col}_W{W}"; out[key]=dict(depth_ppt=d*1e3,sig_white_ppt=sw*1e3,sig_emp_ppt=se*1e3,n_alt=len(alt),flare_amp=[s.x[npoly+3*j+2] for j in range(len(fl))])
        print(key, round(d*1e3,2),"+-",round(se*1e3,2),"ppt (emp); white",round(sw*1e3,2),"n_alt",len(alt),"flare amps",[round(a,4) for a in out[key]["flare_amp"]])
json.dump(out,open("data/step2_flarefixed.json","w"),indent=1)
