"""Same model as step4 (a(1+kP) + per-segment quadratic + 8 h box, +-1.5 d) applied to every S96 product."""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, json
from lcio import load_all
from measure import trapezoid
from common import TC, DUR
pt,pr,ps,pm=np.load("data/prewhiten_resid_SAP_FLUX.npy")
out={}
for r in load_all():
    if r['sector']!=96: continue
    for col in ["SAP_FLUX","PDCSAP_FLUX","KSPSAP_FLUX"]:
        if col not in r: continue
        g=(r['q']==0)&np.isfinite(r[col])&(np.abs(r['t']-TC)<1.5); t=r['t'][g]; y=r[col][g]/np.nanmedian(r[col][g])
        P=np.interp(t,pt,pm); box=trapezoid(t,TC,DUR); seg=(t>3914.3).astype(int)
        for kfree in [True,False]:
            cols=[-box]+([P] if kfree else [])
            for sgi in [0,1]:
                m=(seg==sgi).astype(float)
                for k in range(3): cols.append(m*(t-TC)**k)
            yy=y if kfree else y-P
            A=np.vstack(cols).T; c,*_=np.linalg.lstsq(A,yy,rcond=None); res=yy-A@c
            dt=np.median(np.diff(t)); n=max(2,int(round(DUR/2/dt))); nb=len(res)//n; rb=res[:nb*n].reshape(nb,n).mean(1)
            beta=max(1,np.std(rb)/(np.std(res)/np.sqrt(n)))
            se=np.sqrt(np.linalg.pinv(A.T@A)[0,0])*np.std(res)*beta
            lab=f"{r['author']} {col} k{'free' if kfree else '=1'}"; out[lab]=(c[0]*1e3,se*1e3,(c[1] if kfree else 1.0))
            print(f"{lab:32s} depth {c[0]*1e3:+.3f} +- {se*1e3:.3f} ppt  k={out[lab][2]:.3f}")
json.dump(out,open("data/step2_allproducts.json","w"),indent=1)
