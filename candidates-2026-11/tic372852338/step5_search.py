"""All QLP sectors: (a) the vet's refined ephemeris (P 15.924338, T0 1361.70864) folded per year and overall;
(b) a box search over 1-40 d for dips AND brightenings (flux inverted) on the same data, to see whether the
15.92 d peak is special; (c) the per-epoch depths at the vet ephemeris, including the S69 3193.01 event."""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, json
from astropy.timeseries import BoxLeastSquares
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
from hlsp import load
PV,TV=15.924337850995748,1361.708640887701
L=[r for r in load() if r["author"]=="QLP"]
T=[];F=[];S=[]
for r in L:
    t=r["t"]; y=(r["cols"].get("KSPSAP_FLUX") if "KSPSAP_FLUX" in r["cols"] else r["cols"]["DET_FLUX"]).copy(); g=r["good"]&np.isfinite(y)&np.isfinite(t)
    t=t[g]; y=y[g]/np.nanmedian(y[g])
    # bin to 30 min for uniform weighting across cadences
    b=np.floor((t-t.min())/(1/48)); u,inv=np.unique(b,return_inverse=True)
    tb=np.bincount(inv,t)/np.bincount(inv); yb=np.bincount(inv,y)/np.bincount(inv)
    md=np.median(yb); mad=1.4826*np.median(np.abs(yb-md)); k=np.abs(yb-md)<5*mad
    T.append(tb[k]); F.append(yb[k]); S.append(np.full(k.sum(),r["sector"]))
T=np.concatenate(T);F=np.concatenate(F);S=np.concatenate(S)
sig=np.array([1.4826*np.median(np.abs(F[S==s]-np.median(F[S==s]))) for s in S])
print("points",len(T),"sectors",len(np.unique(S)))
out={}
periods=np.exp(np.linspace(np.log(1.0),np.log(40),60000))
res={}
for name,ff in [("dip",F),("bright",2-F)]:
    for lab,m in [("all",np.ones_like(T,bool)),("S61+",S>=61)]:
        bls=BoxLeastSquares(T[m],ff[m],sig[m]); p=bls.power(periods,4/24,objective="snr")
        i=np.argsort(p.power)[::-1]; top=[]
        for j in i:
            if all(abs(periods[j]/x[0]-1)>0.002 for x in top): top.append((float(periods[j]),float(p.power[j]),float(p.depth[j]*1e3),float(p.transit_time[j])))
            if len(top)>=8: break
        jv=np.argmin(np.abs(periods-PV)); 
        res[f"{name}_{lab}"]=dict(top=top,power_at_vetP=float(p.power[jv]),rank_vetP=int((p.power>p.power[jv]).sum()),median_power=float(np.median(p.power)))
        print(name,lab,"top:",[(round(a,4),round(b,1),round(c,2)) for a,b,c,_ in top[:6]],"| vet P power",round(p.power[jv],1),"n grid points above",res[f"{name}_{lab}"]["rank_vetP"])
out["bls"]=res
# fold at vet ephemeris
ph=((T-TV)/PV+0.5)%1-0.5
for lab,m in [("y1 S1-13",S<=13),("y3 S27-39",(S>=27)&(S<=39)),("y5 S61-69",(S>=61)&(S<=69)),("y7 S87-98",S>=87),("all",S>0)]:
    inn=m&(np.abs(ph*PV)<1.5/24); oo=m&(np.abs(ph*PV)>0.3)&(np.abs(ph*PV)<1.5)
    d=np.mean(F[oo])-np.mean(F[inn]); e=np.std(F[oo])/np.sqrt(inn.sum())
    out["fold_"+lab]=dict(depth_ppt=d*1e3,err_ppt=e*1e3,n_in=int(inn.sum())); print("fold",lab,round(d*1e3,2),"+-",round(e*1e3,2),"ppt, n_in",inn.sum())
# epoch-by-epoch
ep=[]
for k in np.unique(np.round((T-TV)/PV)):
    tc=TV+k*PV; inn=np.abs(T-tc)<1.5/24; oo=(np.abs(T-tc)>0.3)&(np.abs(T-tc)<1.0)
    if inn.sum()<4 or oo.sum()<20: continue
    d=np.mean(F[oo])-np.mean(F[inn]); e=np.std(F[oo])/np.sqrt(inn.sum())
    ep.append(dict(epoch=int(k),tc=round(tc,3),sector=int(S[inn][0]),depth_ppt=round(d*1e3,2),err=round(e*1e3,2),snr=round(d/e,1)))
out["epochs"]=ep
sn=np.array([x["snr"] for x in ep]); print("epochs",len(ep),"n>3sig dips",(sn>3).sum(),"n<-3sig",(sn<-3).sum()); 
for x in sorted(ep,key=lambda x:-abs(x["snr"]))[:6]: print("  ",x)
json.dump(out,open("data/step5_search.json","w"),indent=1)
fig,ax=plt.subplots(1,2,figsize=(13,4))
for lab,m,c in [("S1-13",S<=13,"C0"),("S27-39",(S>=27)&(S<=39),"C1"),("S61+",S>=61,"C2")]:
    x=ph[m]*PV*24; y=F[m]; xb=np.arange(-12,12,0.75); yb=[np.mean(y[(x>=a)&(x<a+.75)])  for a in xb]
    ax[0].plot(xb+.375,(np.array(yb)-1)*1e3,".-",c=c,label=lab)
ax[0].axvspan(-1.8,1.8,color="0.9"); ax[0].legend(); ax[0].set_xlabel("hours from vet ephemeris"); ax[0].set_ylabel("ppt"); ax[0].set_title("QLP KSPSAP/DET folded on P=15.92434 d (45-min bins)")
ax[1].errorbar([x["tc"] for x in ep],[x["depth_ppt"] for x in ep],[x["err"] for x in ep],fmt="o",ms=3); ax[1].axhline(0,c="k"); ax[1].axhline(17.7,c="r",ls=":",label="sweep depth 17.7 ppt"); ax[1].legend(); ax[1].set_xlabel("BTJD"); ax[1].set_ylabel("box depth (ppt)")
fig.tight_layout(); fig.savefig("figs/step5_fold.png",dpi=100)
