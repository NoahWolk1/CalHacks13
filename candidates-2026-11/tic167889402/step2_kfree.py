"""Local fit flux = a(1+kP) + per-segment quadratic + box, slid over S93-97 SAP/PDCSAP,
with k fixed (=1) and k free. Compares the depth at TC with the depth at every other epoch,
and in particular at the other pulsation troughs."""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, json
from measure import trapezoid, segments
from common import TC, DUR
out={}
for col in ["SAP_FLUX","PDCSAP_FLUX"]:
    t,r,s,m=np.load(f"data/prewhiten_resid_{col}.npy"); y=1+r+m  # normalised flux
    def fit(tc,kfree,win=1.5):
        w=np.abs(t-tc)<win; tt=t[w]; yy=y[w]; box=trapezoid(tt,tc,DUR)
        if (box>0.5).sum()<0.8*DUR/(2/1440): return None
        cols=[-box]+([m[w]] if kfree else [])
        for idx in segments(tt):
            if len(idx)<30: continue
            c=np.zeros(len(tt)); c[idx]=1; x=tt-tc
            for k in range(3): cols.append(c*x**k)
        yy2=yy-(0 if kfree else m[w])
        A=np.vstack(cols).T; c,*_=np.linalg.lstsq(A,yy2,rcond=None); return c[0]*1e3
    grid=np.arange(t.min()+1.5,t.max()-1.5,0.05)
    for kfree in [False,True]:
        d0=fit(TC,kfree); D=np.array([fit(g,kfree) if abs(g-TC)>0.5 else np.nan for g in grid],float)
        ok=np.isfinite(D)
        # troughs: local minima of the pulsation model
        mg=np.interp(grid,t,m); tr=ok&(mg< np.percentile(m,15))
        lab=f"{col} k{'free' if kfree else '=1'}"
        print(f"{lab}: depth at TC {d0:.3f} ppt; slid fits N={ok.sum()} robust sigma {1.4826*np.median(np.abs(D[ok]-np.median(D[ok]))):.3f}; frac >= {np.mean(D[ok]>=d0):.3f}; frac <= -{d0:.2f} (brightenings) {np.mean(D[ok]<=-d0):.3f}; at troughs N={tr.sum()} frac>= {np.mean(D[tr]>=d0):.3f}, median {np.median(D[tr]):.3f}")
        out[lab]=dict(depth_tc=float(d0),sigma=float(1.4826*np.median(np.abs(D[ok]-np.median(D[ok])))),frac_deeper=float(np.mean(D[ok]>=d0)),frac_bright=float(np.mean(D[ok]<=-d0)),trough_frac_deeper=float(np.mean(D[tr]>=d0)),trough_median=float(np.median(D[tr])))
json.dump(out,open("data/step2_kfree.json","w"),indent=1)
