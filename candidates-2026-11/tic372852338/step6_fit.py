"""Face-value batman fit of the QLP KSPSAP dip (circular orbit, period fixed) and the implied stellar density, against the
star's (TIC/Gaia FLAME). Usage: step6_fit.py SECTOR TC PERIOD RHO_STAR"""
import warnings; warnings.filterwarnings("ignore")
import sys, json, numpy as np, batman
from scipy.optimize import least_squares
from hlsp import load
s,tc0,P,rhos=int(sys.argv[1]),float(sys.argv[2]),float(sys.argv[3]),float(sys.argv[4])
r=[r for r in load() if r["author"]=="QLP" and r["sector"]==s][0]
t=r["t"]; y=r["cols"]["KSPSAP_FLUX"].copy(); y[~r["good"]]=np.nan; w=np.isfinite(y)&(np.abs(t-tc0)<0.6); t=t[w]; y=y[w]/np.nanmedian(y[w])
k=np.abs(y-1)<0.3; t,y=t[k],y[k]
u=[0.42,0.20]
def model(p):
    rp,b,ars,dt,c0,c1=p
    pm=batman.TransitParams(); pm.t0=tc0+dt; pm.per=P; pm.rp=rp; pm.a=ars; pm.inc=np.degrees(np.arccos(min(b/ars,1))); pm.ecc=0; pm.w=90; pm.u=u; pm.limb_dark="quadratic"
    return batman.TransitModel(pm,t,supersample_factor=7,exp_time=np.nanmedian(np.diff(t))).light_curve(pm)*(c0+c1*(t-tc0))
best=None
for rp0 in [0.08,0.13,0.2]:
    for b0 in [0.2,0.6,0.9]:
        for a0 in [10,30,80]:
            try: sol=least_squares(lambda p:model(p)-y,[rp0,b0,a0,0,1,0],bounds=([0.01,0,1.5,-0.1,0.9,-1],[0.6,1.5,500,0.1,1.1,1]))
            except Exception: continue
            if best is None or sol.cost<best.cost: best=sol
rp,b,ars,dt,c0,c1=best.x
rho=3*np.pi*ars**3/(6.674e-8*(P*86400)**2)/1.41
T14=P/np.pi*np.arcsin(np.sqrt(max((1+rp)**2-b**2,0))/ars/np.sin(np.radians(np.degrees(np.arccos(b/ars)))))*24
# a/R* the star's density implies, and the central T14 then
a_star=(rhos*1.41*6.674e-8*(P*86400)**2/(3*np.pi))**(1/3); T14c=P/np.pi*np.arcsin(1/a_star)*24
out=dict(sector=s,tc_fit=tc0+dt,P_fixed=P,rp_rs=rp,b=b,a_rs=ars,T14_h=T14,depth_ppt=rp**2*1e3,rho_fit_solar=rho,rho_star_solar=rhos,a_rs_from_star=a_star,T14_central_h_from_star=T14c,
         rms_ppt=float(np.std(best.fun))*1e3,n=len(t))
print(json.dumps(out,indent=1,default=float)); json.dump(out,open(f"data/step6_fit_s{s}.json","w"),indent=1,default=float)
