"""The SAP step at ~2190.355 in S32: size in each product, persistence (levels over the rest of the orbit), and whether
a step model (no dip) fits as well as a dip model."""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, json
from lcio import load_all
from measure import trapezoid
from common import *
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
out={}
fig,ax=plt.subplots(3,1,figsize=(13,10))
for k,r in enumerate(load_all(sectors=[32])):
    A=r["author"]; t=r["t"]; q=r["q"]
    for c in ["SAP_FLUX","PDCSAP_FLUX","KSPSAP_FLUX","FLUX"]:
        if c not in r: continue
        y=r[c]; ok=np.isfinite(y)&np.isfinite(t)&(q==0); tt=t[ok]; yy=y[ok]/np.nanmedian(y[ok])
        # orbit split
        gi=np.where(np.diff(tt)>0.5)[0]; print(A,c,"gaps",[(round(tt[i],2),round(tt[i+1],2)) for i in gi], "span",tt.min(),tt.max())
        nb=max(int(round((1/24)/np.median(np.diff(tt)))),1); n=len(tt)//nb
        ax[k].plot(tt[:n*nb].reshape(n,nb).mean(1),(yy[:n*nb].reshape(n,nb).mean(1)-1)*1e3,'.',ms=2,label=c)
        # step location by max |mean diff| between 0.3-d windows
        grid=np.arange(2189.0,2191.5,0.0035); best=None
        def lvl(a,b): m=(tt>a)&(tt<b); return np.mean(yy[m]) if m.sum()>3 else np.nan
        dd=np.array([lvl(g,g+0.3)-lvl(g-0.3,g) for g in grid]); j=np.nanargmax(np.abs(dd))
        ts=grid[j]
        # local models within ±1 d: (a) line + step, (b) line + trapezoid dip (tc, dur fixed to vet), (c) line + step + dip
        w=np.abs(tt-TC)<1.0; x=tt[w]-TC; f=yy[w]
        S=(tt[w]>ts).astype(float); D=-trapezoid(tt[w],TC,DUR)
        res={}
        for lab,cols in [("line",[np.ones_like(x),x]),("line+step",[np.ones_like(x),x,S]),("line+dip",[np.ones_like(x),x,D]),("quad+dip",[np.ones_like(x),x,x**2,D]),("line+step+dip",[np.ones_like(x),x,S,D])]:
            M=np.vstack(cols).T; c_,*_=np.linalg.lstsq(M,f,rcond=None); rr=f-M@c_; chi=np.sum(rr**2)
            res[lab]=dict(coef=[float(v) for v in c_],rss=float(chi),n=int(len(f)),k=M.shape[1])
        s2=res["line+step+dip"]["rss"]/(len(f)-5)
        for lab in res: res[lab]["chi2"]=res[lab]["rss"]/s2; res[lab]["bic"]=res[lab]["chi2"]+res[lab]["k"]*np.log(len(f))
        o=dict(step_time=float(ts),step_ppt=float(dd[j]*1e3),
               levels_ppt={f"{a}-{b}":round(float((lvl(a,b)-lvl(2188.0,2190.3))*1e3),2) for a,b in [(2187.0,2188.0),(2188.0,2190.3),(2190.15,2190.35),(2190.36,2191),(2191,2193),(2193,2196),(2196,2199)]},
               step_plus_dip_depth_ppt=float(res["line+step+dip"]["coef"][3]*1e3), step_in_step_plus_dip_ppt=float(res["line+step+dip"]["coef"][2]*1e3),
               dip_only_depth_ppt=float(res["line+dip"]["coef"][2]*1e3), quad_dip_depth_ppt=float(res["quad+dip"]["coef"][3]*1e3),
               bic={l:round(v["bic"],1) for l,v in res.items()})
        out[f"{A} {c}"]=o; print(A,c,json.dumps(o))
    ax[k].axvspan(TC-DUR/2,TC+DUR/2,color='orange',alpha=.3); ax[k].legend(fontsize=7); ax[k].set_title(f"{A} S32 (1 h bins)"); ax[k].set_ylim(-25,25)
plt.tight_layout(); plt.savefig("figs/step2_s32_full.png",dpi=95)
json.dump(out,open("data/step2_step.json","w"),indent=1)
