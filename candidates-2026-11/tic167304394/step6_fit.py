"""batman fit of the primary (200-s sectors) and the secondary at phase 0.738; implied density and companion size
for (a) all light from one star, (b) the eclipsed star being one component of the 0.36" Gaia pair."""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, json, batman
from scipy.optimize import least_squares
from lcio import load_all
fo=json.load(open("data/step5_fold.json")); T0=fo["ephem"]["T0"]; P=fo["ephem"]["P"]
L=[r for r in load_all() if r["sector"]>=61]
def stack(phase_c,win=0.4):
    X=[];Y=[]
    for r in L:
        t=r["t"]; y=r["SAP_FLUX"]; g=(r["q"]==0)&np.isfinite(y)&np.isfinite(t)
        for k in np.arange(np.floor((t[g].min()-T0)/P)-1,np.ceil((t[g].max()-T0)/P)+1):
            tc=T0+(k+phase_c)*P; m=g&(np.abs(t-tc)<win)
            oot=m&(np.abs(t-tc)>0.12)
            if (m&(np.abs(t-tc)<0.06)).sum()<10 or oot.sum()<60: continue
            p=np.polyfit(t[oot]-tc,y[oot],2); X.append(t[m]-tc); Y.append(y[m]/np.polyval(p,t[m]-tc))
    return np.concatenate(X),np.concatenate(Y)
x,y=stack(0.0)
print("primary points",len(x))
# LD for Teff 5300, logg 4.5 in TESS band (Claret 2017 approx)
u=[0.42,0.20]
def model(p,x,dil=1.0,ret=False):
    rp,b,ars,dt=p
    pm=batman.TransitParams(); pm.t0=dt; pm.per=P; pm.rp=rp; pm.a=ars; pm.inc=np.degrees(np.arccos(min(b/ars,1))); pm.ecc=0; pm.w=90; pm.u=u; pm.limb_dark="quadratic"
    f=batman.TransitModel(pm,x).light_curve(pm)
    return 1-(1-f)*dil
fits={}
for name,dil in [("single_star",1.0),("one_of_pair_G12.79",0.466*0.87),("one_of_pair_G12.64",0.534*0.87)]:
    best=None
    for rp0 in [0.15,0.3,0.5,0.8]:
        for b0 in [0.8,1.0,1.2]:
            try:
                s=least_squares(lambda p:model(p,x,dil)-y,[rp0,b0,40,0],bounds=([0.01,0,2,-0.02],[1.5,2.4,300,0.02]))
            except Exception: continue
            if best is None or s.cost<best.cost: best=s
    rp,b,ars,dt=best.x; J=best.jac; cov=np.linalg.pinv(J.T@J)*np.var(best.fun)
    rho=3*np.pi*ars**3/(6.674e-8*(P*86400)**2)/1.41
    fits[name]=dict(dilution=dil,rp_rs=rp,b=b,a_rs=ars,rho_circ_solar=rho,err=np.sqrt(np.diag(cov)).tolist(),rms_ppt=np.std(best.fun)*1e3,grazing=bool(b>1-rp))
    print(name,{k:(round(v,4) if isinstance(v,float) else v) for k,v in fits[name].items()})
# residual check: symmetric? compare first and second half residuals
xs,ys=stack(0.0,0.3)
for half,m in [("ingress half",(xs<0)&(xs>-0.08)),("egress half",(xs>0)&(xs<0.08))]: print(half,"mean flux deficit",round((1-np.mean(ys[m]))*1e3,2),"ppt")
# secondary: box depth + width from stacked 200-s data
x2,y2=stack(-0.262,0.5)
best=None
for c in np.arange(-0.05,0.05,0.002):
    for w in np.arange(0.06,0.30,0.01):
        m=np.abs(x2-c)<w/2; oo=np.abs(x2-c)>w/2+0.03
        if m.sum()<30: continue
        d=np.mean(y2[oo])-np.mean(y2[m]); e=np.std(y2[oo])/np.sqrt(m.sum())
        if best is None or d/e>best[2]: best=(c,w,d/e,d)
print("secondary (200-s sectors): centre offset",round(best[0]*24,2),"h, width",round(best[1]*24,2),"h, depth",round(best[3]*1e3,2),"ppt, white SNR",round(best[2],1))
ph2=(-0.262+best[0]/P)%1
ecosw=np.pi/2*(ph2-0.5)
fits["secondary"]=dict(phase=ph2,width_h=best[1]*24,depth_ppt=best[3]*1e3,ecosw_approx=ecosw,width_ratio=best[1]*24/(2*1.69*1.0))
print("secondary phase",round(ph2,4),"e cos w ~",round(ecosw,3))
json.dump(fits,open("data/step6_fit.json","w"),indent=1,default=float)
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
fig,ax=plt.subplots(1,2,figsize=(13,4.5))
o=np.argsort(x); ax[0].plot(x*24,(y-1)*1e3,",",color="0.6"); 
xb=np.arange(-0.3,0.3,0.004); yb=[np.mean(y[(x>=a)&(x<a+0.004)]) for a in xb]; ax[0].plot((xb+0.002)*24,(np.array(yb)-1)*1e3,"k.",ms=3)
for name,c in [("single_star","r"),("one_of_pair_G12.79","b")]:
    f=fits[name]; ax[0].plot(x[o]*24,(model([f["rp_rs"],f["b"],f["a_rs"],0],x[o],f["dilution"])-1)*1e3,c,lw=1,label=f"{name}: Rp/R*={f['rp_rs']:.2f}, b={f['b']:.2f}")
ax[0].set_xlim(-6,6); ax[0].set_ylim(-75,10); ax[0].legend(fontsize=7); ax[0].set_xlabel("hours"); ax[0].set_ylabel("ppt"); ax[0].set_title(f"Primary, 13 epochs S61-S93, P={P:.5f} d")
xb=np.arange(-0.5,0.5,0.01); yb=[np.mean(y2[(x2>=a)&(x2<a+0.01)]) for a in xb]
ax[1].plot((xb+0.005)*24,(np.array(yb)-1)*1e3,"k.-",ms=3); ax[1].set_xlabel("hours from phase 0.738"); ax[1].set_ylabel("ppt"); ax[1].set_title("Secondary eclipse (15-min bins)")
fig.tight_layout(); fig.savefig("figs/fit.png",dpi=100)
