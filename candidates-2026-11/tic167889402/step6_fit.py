"""Face-value batman fit to the prewhitened S96 residuals (PDCSAP: where the feature is largest; SAP for comparison),
+-1.5 d, linear baseline per segment; implied stellar density at several periods vs the catalogue (R 1.42, M ~1.25 -> 0.44 rho_sun)."""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, json, batman
from scipy.optimize import least_squares
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
from common import TC
RHO_CAT=0.44
out={}; fig,axs=plt.subplots(2,1,figsize=(10,8),sharex=True)
for ax,col in zip(axs,["PDCSAP_FLUX","SAP_FLUX"]):
    t,r,s,m=np.load(f"data/prewhiten_resid_{col}.npy")
    w=(np.abs(t-TC)<1.5)&(t>3914.45); t=t[w]; y=1+r[w]
    def model(p,P,tt):
        tc,k,b,lrho,c0,c1=p
        aR=((6.674e-8*10**lrho*1.408*(P*86400)**2)/(3*np.pi))**(1/3)
        pr=batman.TransitParams(); pr.t0=tc; pr.per=P; pr.rp=k; pr.a=aR; pr.inc=np.degrees(np.arccos(min(b/aR,1))); pr.ecc=0; pr.w=90; pr.u=[0.31,0.29]; pr.limb_dark="quadratic"
        return batman.TransitModel(pr,tt).light_curve(pr)*(c0+c1*(tt-TC))
    out[col]={}
    for P in [40.0,100.0,300.0,1000.0]:
        best=None
        for b0 in [0.1,0.5,0.85]:
            for lr in [-1.5,-0.5,0.5]:
                rr=least_squares(lambda p: model(p,P,t)-y,[TC,0.025,b0,lr,1,0],bounds=([TC-0.3,0.003,0,-3,0.99,-0.01],[TC+0.3,0.1,1.1,2,1.01,0.01]))
                if best is None or rr.cost<best.cost: best=rr
        p=best.x; res=y-model(p,P,t)
        # null model: line only
        A=np.vstack([np.ones_like(t),t-TC]).T; c,*_=np.linalg.lstsq(A,y,rcond=None); chi0=np.sum((y-A@c)**2); chi1=np.sum(res**2)
        n=len(t); dbic=n*np.log(chi0/n)-(n*np.log(chi1/n)+4*np.log(n))
        aR=((6.674e-8*10**p[3]*1.408*(P*86400)**2)/(3*np.pi))**(1/3)
        T14=P/np.pi*np.arcsin(np.sqrt(max((1+p[1])**2-p[2]**2,0))/aR)*24
        out[col][P]=dict(tc=round(p[0],3),depth_ppt=round(p[1]**2*1e3,3),b=round(p[2],2),rho=round(10**p[3],3),rho_ratio=round(10**p[3]/RHO_CAT,2),T14_h=round(T14,1),dBIC_vs_line=round(dbic,1))
        print(col,P,out[col][P])
    ax.plot(t,(y-1)*1e3,',',c='0.6'); tb=np.arange(t.min(),t.max(),1/24); yb=[np.mean(y[(t>=a)&(t<a+1/24)]) for a in tb]
    ax.plot(tb+1/48,(np.array(yb)-1)*1e3,'ko',ms=3); tt=np.linspace(t.min(),t.max(),2000)
    ax.plot(tt,(model(p,P,tt)-1)*1e3,'r-',label=f"P=1000 d: depth {out[col][P]['depth_ppt']} ppt, T14 {out[col][P]['T14_h']} h, ΔBIC {out[col][P]['dBIC_vs_line']}")
    ax.set_title(col+" (40 frequencies prewhitened, S93-97)"); ax.legend(fontsize=8); ax.set_ylim(-2,2)
fig.tight_layout(); fig.savefig("figs/step6_fit.png",dpi=100)
json.dump({c:{str(k):v for k,v in d.items()} for c,d in out.items()},open("data/step6_fit.json","w"),indent=1)
