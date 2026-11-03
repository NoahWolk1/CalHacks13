"""All QLP sectors: (a) precise centres of the two deep events, (b) box search of raw SAP for any other >=3 h dip
and brightening, (c) periods DeltaT/n allowed by coverage, (d) secondary-eclipse limits along each allowed period."""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, json, pandas as pd
from scipy.optimize import least_squares
from scipy.ndimage import median_filter
from lcio import load_all
L=sorted(load_all(),key=lambda r:r["sector"])
def vmodel(p,t):
    tc,d,w,k=p[:4]; x=np.abs(t-tc)/w
    return 1-d*np.clip(1-x**k,0,None)
out={}
cent={}
for name,s,tc0 in [("main",31,2169.22),("dip2",67,3148.75)]:
    r=[r for r in L if r["sector"]==s][0]; t=r["t"]; y=r["SAP_FLUX"]; g=(r["q"]&~4096==0)&np.isfinite(y)&(np.abs(t-tc0)<0.6)
    t=t[g]; y=y[g]
    def res(p): return y/(p[4]+p[5]*(t-tc0))-vmodel(p,t)
    sol=least_squares(res,[tc0,0.06,0.07,1.5,np.median(y),0])
    J=sol.jac; cov=np.linalg.pinv(J.T@J)*np.var(sol.fun)
    cent[name]=dict(tc=sol.x[0],tc_err=np.sqrt(cov[0,0]),depth_ppt=sol.x[1]*1e3,halfwidth_h=sol.x[2]*24,shape_k=sol.x[3],rms_ppt=np.std(sol.fun)*1e3)
    print(name,cent[name])
out["centres"]=cent
DT=cent["dip2"]["tc"]-cent["main"]["tc"]; sig=np.hypot(cent["dip2"]["tc_err"],cent["main"]["tc_err"])
print("DeltaT",DT,"+-",sig); out["DeltaT"]=DT
# detrended SAP for all sectors: 1-d running median per segment (event cadences masked)
T=[];F=[];S=[]
for r in L:
    t=r["t"]; y=r["SAP_FLUX"].copy(); g=(r["q"]==0)&np.isfinite(y)&np.isfinite(t)
    t=t[g]; y=y[g]
    if len(t)<50: print('skip sector',r['sector'],len(t)); continue
    dt=np.nanmedian(np.diff(t)); n=int(round(1.0/dt))|1
    br=np.where(np.diff(t)>0.25)[0]+1; f=np.empty_like(y)
    for idx in np.split(np.arange(len(t)),br):
        yy=y[idx].copy(); m=np.zeros(len(idx),bool)
        for c in cent.values(): m|=np.abs(t[idx]-c["tc"])<0.15
        yy[m]=np.nan
        base=pd.Series(yy).rolling(n,center=True,min_periods=max(3,n//4)).median().to_numpy()
        f[idx]=y[idx]/base-1
    T.append(t);F.append(f);S.append(np.full(len(t),r["sector"]))
T=np.concatenate(T);F=np.concatenate(F);S=np.concatenate(S)
np.save("data/detrended_sap.npy",np.vstack([T,F,S]))
# (b) box search, 3.4 h box, step 20 min (cumulative sums)
o=np.argsort(T); T,F,S=T[o],F[o],S[o]
hits=[]; dur=3.4/24
grid=np.arange(T.min(),T.max(),1/72)
cs=np.r_[0,np.cumsum(F)]; lo=np.searchsorted(T,grid-dur/2); hi=np.searchsorted(T,grid+dur/2)
nin=hi-lo; dtl=np.array([np.median(np.diff(T[S==s])) for s in S[np.clip(lo,0,len(T)-1)]]) if False else None
secdt={int(s):np.median(np.diff(T[S==s])) for s in np.unique(S)}
dts=np.array([secdt[int(x)] for x in S[np.clip(lo,0,len(T)-1)]])
dep=np.where((nin>=5)&(nin*dts>=0.6*dur),-(cs[hi]-cs[lo])/np.maximum(nin,1),np.nan)
err=np.full(len(grid),np.nan)
# per-sector robust scatter of box depths -> red-noise sigma
gs=S[np.clip(lo,0,len(T)-1)]
sec_sig={}
for s in np.unique(S):
    ss=(gs==s)&np.isfinite(dep)
    sec_sig[int(s)]=1.4826*np.nanmedian(np.abs(dep[ss]-np.nanmedian(dep[ss])))
sred=np.array([sec_sig[int(x)] for x in gs])
z=dep/sred
order=np.argsort(-np.abs(np.nan_to_num(z)))
used=[]
for i in order:
    if not np.isfinite(z[i]) or abs(z[i])<5: break
    if any(abs(grid[i]-u)<0.5 for u in used): continue
    used.append(grid[i]); hits.append(dict(t=round(grid[i],3),sector=int(gs[i]),depth_ppt=round(dep[i]*1e3,2),z_red=round(z[i],1)))
    if len(hits)>=25: break
for h in hits: print("hit",h)
out["hits"]=hits; out["sector_box_sigma_ppt"]={k:round(v*1e3,3) for k,v in sec_sig.items()}
print("per-sector 3.4h box sigma (ppt):",out["sector_box_sigma_ppt"])
# (c) allowed periods DeltaT/n: a predicted centre is "covered" if >=3 cadences lie within +-1.2 h (eclipse there >~25 ppt)
tc1=cent["main"]["tc"]; tc2=cent["dip2"]["tc"]; allowed=[]
for n in range(1,3000):
    P=DT/n
    if P<0.5: break
    k=np.arange(np.floor((T.min()-tc1)/P)-1,np.ceil((T.max()-tc1)/P)+2)
    ep=tc1+k*P; ep=ep[(np.abs(ep-tc1)>0.2)&(np.abs(ep-tc2)>0.2)]
    l=np.searchsorted(T,ep-0.05); h=np.searchsorted(T,ep+0.05); cov=(h-l)>=3
    obs=[(round(e,3),round(-np.median(F[a_:b_])*1e3,1)) for e,a_,b_,c in zip(ep,l,h,cov) if c]
    if not any(d<20 for _,d in obs): allowed.append(dict(n=n,P=round(P,4),covered_epochs=obs))
print("allowed n:",[(a["n"],a["P"],a["covered_epochs"]) for a in allowed])
out["allowed_periods"]=allowed
# (d) secondary: deepest 3.4 h box away from the two events, any phase (eccentric orbits allowed)
ok=np.isfinite(dep)&(np.abs(grid-tc1)>0.3)&(np.abs(grid-tc2)>0.3)
out["deepest_other_box"]=dict(t=float(grid[ok][np.nanargmax(dep[ok])]),depth_ppt=float(np.nanmax(dep[ok])*1e3))
# for each allowed P, phase coverage and deepest box at any phase
lim={}
for a_ in allowed:
    P=a_["P"]; ph=((grid[ok]-tc1)/P)%1
    lim[a_["n"]]=dict(P=P,phase_coverage=round(len(np.unique(np.floor(ph*P/(dur/2))))/np.ceil(P/(dur/2)),3),
                      max_box_ppt=round(float(np.nanmax(dep[ok]))*1e3,2),limit_3sigma_ppt=round(3*float(np.nanmedian(sred[ok]))*1e3,2))
    print("secondary",lim[a_["n"]])
out["secondary"]=lim
json.dump(out,open("data/step5_search.json","w"),indent=1,default=float)
np.save("data/boxscan.npy",np.vstack([grid,dep,sred]))
