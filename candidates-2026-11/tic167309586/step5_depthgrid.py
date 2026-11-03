"""Depth of an 8 h trapezoid at every tc on a 0.02 d grid, for every LC/column (binned to >=10 min), with an
empirical per-LC scatter (robust std of all grid depths with >=80% coverage). Used for alias tests and a blind single-event list."""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, pickle
from lcio import load_all
from measure import fit_depth
from common import DUR
L=load_all(); G={}
COLS={"SPOC":["SAP_FLUX","PDCSAP_FLUX"],"TESS-SPOC":["SAP_FLUX","PDCSAP_FLUX"],"QLP":["SAP_FLUX","KSPSAP_FLUX","DET_FLUX"]}
def binlc(t,y,dt):
    g=np.isfinite(t)&np.isfinite(y); t,y=t[g],y[g]
    if np.median(np.diff(t))>dt*0.8: return t,y
    k=np.floor((t-t[0])/dt).astype(int); u,inv,cnt=np.unique(k,return_inverse=True,return_counts=True)
    tb=np.bincount(inv,t)/cnt; yb=np.bincount(inv,y)/cnt; ok=cnt>=max(2,int(0.5*dt/np.median(np.diff(t))))
    return tb[ok],yb[ok]
for r in L:
    for c in COLS[r["author"]]:
        if c not in r: continue
        y=r[c].copy(); y[r["q"]!=0]=np.nan
        t,yb=binlc(r["t"],y,10/1440.)
        if len(t)<100: continue
        yb=yb/np.nanmedian(yb)
        grid=np.arange(np.floor(t.min()*50)/50-0.2, t.max()+0.2, 0.02)
        D=np.full(len(grid),np.nan); S=np.full(len(grid),np.nan); C=np.zeros(len(grid))
        for i,tc in enumerate(grid):
            fr=fit_depth(t,yb,tc,DUR,win=1.0,order=2,min_cov=0.3)
            if fr is None: continue
            C[i]=fr["cov"]
            if np.isfinite(fr.get("depth",np.nan)): D[i]=fr["depth"]; S[i]=fr["sig_white"]*fr["beta"]
        ok=np.isfinite(D)&(C>=0.8)
        semp=1.4826*np.nanmedian(np.abs(D[ok]-np.nanmedian(D[ok]))) if ok.sum()>20 else np.nan
        G[(int(r["sector"]),r["author"],c)]=dict(grid=grid,depth=D,sig=S,cov=C,sig_emp=semp)
        print(r["sector"],r["author"],c,"sig_emp %.3f ppt"%(semp*1e3),flush=True)
pickle.dump(G,open("data/depthgrid.pkl","wb"))
