"""Which periods would a real 22 ppt, 2 h transit at BTJD 1635.158 be allowed to have, given all SPOC/TESS-SPOC data (and, separately, QLP)?"""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, json
S=np.load("data/series.npy",allow_pickle=True)
T0=1635.158; DUR=2/24; DEP=0.022; RES=0.004
def excl_grid(authors):
    tmin=min(s[2].min() for s in S); tmax=max(s[2].max() for s in S)
    g=np.arange(1300,4100,RES); ex=np.zeros(len(g),bool)
    for a,sec,t,d in S:
        if a not in authors: continue
        dt=np.median(np.diff(t)); i0=np.searchsorted(t,g-DUR/2); i1=np.searchsorted(t,g+DUR/2)
        cs=np.concatenate([[0],np.cumsum(d-1)]); cs2=np.concatenate([[0],np.cumsum((d-1)**2)]); n=i1-i0
        ok=n>=0.5*DUR/dt
        mean=np.where(ok,(cs[i1]-cs[i0])/np.maximum(n,1),np.nan)
        rms=1.4826*np.nanmedian(np.abs(d-1))
        sig=rms/np.sqrt(np.maximum(n,1))*2.0   # x2 allowance for red noise
        ex|= ok & (-mean+3*sig<DEP)
    return g,ex
out={}
for lab,auth in [("SPOC+TESS-SPOC",("SPOC","TESS-SPOC")),("SPOC+TESS-SPOC+QLP",("SPOC","TESS-SPOC","QLP"))]:
    g,ex=excl_grid(auth)
    P=np.exp(np.arange(np.log(1.0),np.log(3000),2e-6))
    allowed=np.ones(len(P),bool)
    for k in range(-400,2600):
        if k==0: continue
        tk=T0+k*P; m=(tk>1300)&(tk<4100-RES)
        if not m.any(): continue
        idx=((tk[m]-1300)/RES).round().astype(int)
        allowed[np.where(m)[0][ex[idx]]]=False
    # summarise allowed intervals
    a=allowed.astype(int); edges=np.flatnonzero(np.diff(np.r_[0,a,0]))
    iv=[(P[edges[i]],P[edges[i+1]-1]) for i in range(0,len(edges),2)]
    frac={f"{lo}-{hi} d":float(allowed[(P>=lo)&(P<hi)].mean()) for lo,hi in [(1,10),(10,30),(30,100),(100,300),(300,1000),(1000,3000)]}
    shortest=P[allowed].min() if allowed.any() else None
    big=[(round(x,2),round(y,2)) for x,y in iv if y-x>0.5]
    print(lab,"shortest allowed P",shortest,"allowed fraction by range",frac)
    print("  allowed intervals wider than 0.5 d (first 40):",big[:40]," ... total",len(big))
    out[lab]=dict(shortest=shortest,frac=frac,intervals_gt0p5d=big)
json.dump(out,open("data/step5_periods.json","w"),indent=1)
