"""Model SAP around each event as smooth baseline + flare(s) [+ 6 h trapezoid dip]. Compare BIC and the dip depth."""
import numpy as np, json, matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
from scipy.optimize import least_squares
from lcio import load_all
from measure import trapezoid
def flare(t,tp,fwhm,amp):
    # Davenport et al. 2014 template; Gaussian-smoothed rise approximated by the polynomial rise
    x=(t-tp)/fwhm; f=np.zeros_like(t)
    r=(x>-1)&(x<=0); f[r]=1+1.941*x[r]-0.175*x[r]**2-2.246*x[r]**3-1.125*x[r]**4
    d=x>0; f[d]=0.6890*np.exp(-1.600*x[d])+0.3030*np.exp(-0.2783*x[d])
    return amp*f
EV={65:(3084.74,[3084.45,3084.58]),97:(3979.76,[3979.40])}
out={}; fig,axs=plt.subplots(2,2,figsize=(14,8))
for k,(sec,(tc,fl)) in enumerate(EV.items()):
    r=load_all(sectors=[sec])[0]; t=r["t"]; f=r["SAP_FLUX"]
    g=np.isfinite(t)&np.isfinite(f)&(r["q"]==0)&(np.abs(t-tc)<1.5); t=t[g]; y=f[g]/np.nanmedian(f[g]); t0=t.mean()
    npoly=4; nfl=len(fl)
    def model(p,dip):
        b=np.polyval(p[:npoly][::-1]*0+p[:npoly],t-t0) if False else sum(p[i]*(t-t0)**i for i in range(npoly))
        m=b.copy()
        for j in range(nfl): m+=flare(t,p[npoly+3*j],abs(p[npoly+3*j+1]),p[npoly+3*j+2])
        if dip: m-=p[-2]*trapezoid(t,p[-1],0.25)
        return m
    res={}
    for dip in [False,True]:
        p0=[1,0,0,0]+sum([[x,0.05,0.02] for x in fl],[])+([0.002,tc] if dip else [])
        best=None
        for tcs in ([tc] if not dip else np.arange(tc-0.3,tc+0.31,0.05)):
            if dip: p0[-1]=tcs
            s=least_squares(lambda p:model(p,dip)-y,p0)
            if best is None or s.cost<best.cost: best=s
        rr=best.fun; n=len(y); kpar=len(best.x); chi2=np.sum(rr**2)/np.var(rr)
        # red-noise-inflated sigma via jacobian
        J=best.jac; cov=np.linalg.pinv(J.T@J)*np.var(rr)
        res[dip]=dict(p=best.x.tolist(),rss=float(np.sum(rr**2)),n=n,k=kpar,bic=float(n*np.log(np.sum(rr**2)/n)+kpar*np.log(n)))
        if dip: res[dip].update(depth_ppt=best.x[-2]*1e3,sig_white_ppt=np.sqrt(cov[-2,-2])*1e3,tc=best.x[-1])
        ax=axs[k,int(dip)]; ax.plot(t,y,'.',ms=2,c='k'); ax.plot(t,model(best.x,dip),c='r'); ax.axvspan(tc-0.125,tc+0.125,color='y',alpha=.3)
        ax.set_title(f"S{sec} SAP: baseline+flare{' + dip' if dip else ''}")
    dB=res[True]["bic"]-res[False]["bic"]
    print(sec, "flare params", [round(v,4) for v in res[False]["p"][npoly:]], "dip:", round(res[True]["depth_ppt"],2),"+-",round(res[True]["sig_white_ppt"],2),"(white) at",round(res[True]["tc"],3)," dBIC(dip-nodip)",round(dB,1))
    out[f"S{sec}"]=dict(nodip=res[False],dip=res[True],dBIC=dB)
plt.tight_layout(); plt.savefig("figs/step2_flaremodel.png",dpi=90)
json.dump(out,open("data/step2_flaremodel.json","w"),indent=1,default=float)
