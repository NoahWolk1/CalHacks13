"""All 40 QLP sectors: box search (6 h and 9 h) on the QLP detrended flux after a 1 d running median; dips AND brightenings;
the events' rank; then the periods still allowed for the S1 dip (8 ppt, 6 h)."""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, json
from lcio import load_all
from cfg import *
def rmed(t,y,win=1.0):
    o=np.empty_like(y); j0=j1=0; n=len(t)
    for i in range(n):
        while t[j0]<t[i]-win/2: j0+=1
        while j1<n and t[j1]<=t[i]+win/2: j1+=1
        o[i]=np.median(y[j0:j1])
    return y/o
S=[]
for r in load_all(authors=["QLP"]):
    c="DET_FLUX" if "DET_FLUX" in r else "KSPSAP_FLUX"
    t=r["t"]; y=r[c]; ok=np.isfinite(t)&np.isfinite(y)&(r["q"]==0)&(y>0)
    t,y=t[ok],y[ok]/np.median(y[ok]); S.append((r["sector"],t,rmed(t,y)))
np.save("data/series.npy",np.array(S,dtype=object),allow_pickle=True)
res={}
for dur in [0.25,0.375]:
    allbox=[]
    for s,t,d in S:
        dt=np.median(np.diff(t)); g=np.arange(t.min()+dur,t.max()-dur,0.01)
        i0=np.searchsorted(t,g-dur/2); i1=np.searchsorted(t,g+dur/2); n=i1-i0; ok=n>=0.7*dur/dt
        cs=np.concatenate([[0],np.cumsum(d-1)]); dep=-(cs[i1]-cs[i0])/np.maximum(n,1)
        g,dep=g[ok],dep[ok]; sig=1.4826*np.median(np.abs(dep-np.median(dep)))
        for x,dd in zip(g,dep): allbox.append((s,x,dd,dd/sig))
    A=np.array([(b[0],b[1],b[2],b[3]) for b in allbox])
    # independent events: greedy peak picking separated by > 1 d
    def picks(sign):
        o=np.argsort(-sign*A[:,3]); used=[]; out=[]
        for i in o:
            if len(out)>=15: break
            if any(abs(A[i,1]-u)<1 for u in used): continue
            used.append(A[i,1]); out.append(dict(sector=int(A[i,0]),t=round(A[i,1],3),depth_ppt=round(A[i,2]*1e3,2),snr=round(A[i,3],1)))
        return out
    dips=picks(1); brights=picks(-1)
    ev={}
    for tc in [TC,TC2]:
        m=np.abs(A[:,1]-tc)<0.1
        if m.any(): j=np.where(m)[0][np.argmax(A[m,3])]; ev[str(tc)]=dict(snr=round(A[j,3],1),depth_ppt=round(A[j,2]*1e3,2),t=round(A[j,1],3),
            n_dips_ge=int(sum(1 for x in dips if x["snr"]>=A[j,3])),n_brightenings_ge=int(sum(1 for x in brights if -x["snr"]>=A[j,3])))
    span=sum(t.max()-t.min() for _,t,_ in S)
    res[f"{dur*24:.0f}h"]=dict(events=ev,top_dips=dips,top_brightenings=brights,days=round(span,1))
    print(f"== {dur*24:.0f} h box, {len(S)} sectors, {span:.0f} d"); print(" events:",ev)
    print(" top dips:",[(x['sector'],x['t'],x['depth_ppt'],x['snr']) for x in dips[:10]])
    print(" top brightenings:",[(x['sector'],x['t'],x['depth_ppt'],x['snr']) for x in brights[:10]])
# allowed periods for an 8 ppt, 6 h dip at TC (exclude where a box at the predicted time has depth + 3 sigma_local < 8 ppt... i.e. clearly absent)
D=0.008; dur=0.25; RES=0.005
g=np.arange(1300,4100,RES); ex=np.zeros(len(g),bool)
for s,t,d in S:
    dt=np.median(np.diff(t)); i0=np.searchsorted(t,g-dur/2); i1=np.searchsorted(t,g+dur/2); n=i1-i0; ok=n>=0.6*dur/dt
    cs=np.concatenate([[0],np.cumsum(d-1)]); dep=-(cs[i1]-cs[i0])/np.maximum(n,1)
    rms=1.4826*np.median(np.abs(d-1)); sig=rms/np.sqrt(np.maximum(n,1))*2.0
    ex|=ok&(dep+3*sig<D)
P=np.exp(np.arange(np.log(1.0),np.log(3000),2e-5)); allowed=np.ones(len(P),bool)
for k in range(-3000,3000):
    if k==0: continue
    tk=TC+k*P; m=(tk>1300)&(tk<4100-RES)
    if not m.any(): continue
    idx=((tk[m]-1300)/RES).round().astype(int); allowed[np.where(m)[0][ex[idx]]]=False
frac={f"{lo}-{hi}":round(float(allowed[(P>=lo)&(P<hi)].mean()),3) for lo,hi in [(1,30),(30,100),(100,300),(300,1000),(1000,3000)]}
print("allowed fraction of periods for the S1 dip:",frac,"shortest",P[allowed].min())
Pn={n:bool(allowed[np.argmin(np.abs(P-(TC2-TC)/n))]) for n in range(1,13)}
print("(3028.91-1329.011)/n allowed?",Pn)
res["periods"]=dict(frac=frac,shortest=float(P[allowed].min()),P_over_n_allowed=Pn)
json.dump(res,open("data/step5_search.json","w"),indent=1,default=float)
