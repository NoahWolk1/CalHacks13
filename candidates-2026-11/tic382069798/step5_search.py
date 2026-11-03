"""All sectors (TESS-SPOC SAP where available, else QLP SAP): (1) 5.4 h box search on a ±1 d local-quadratic baseline, counting dips and
brightenings; (2) the same with a free step term at the box end/start (as at 2190.358); (3) step scan: abrupt level shifts > 3 ppt.
Also looks at the vet's brightening at 3919.94 and dip at 3932.69."""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, json
from lcio import load_all
from measure import trapezoid
from common import *
S=[]; have=set()
R=load_all(authors=["TESS-SPOC"])+load_all(authors=["QLP"])
for r in R:
    if r["sector"] in have: continue
    t=r["t"]; y=r["SAP_FLUX"]; ok=np.isfinite(t)&np.isfinite(y)&(r["q"]==0)&(y>0)
    if ok.sum()<300: continue
    have.add(r["sector"]); S.append((r["author"],r["sector"],t[ok],y[ok]/np.median(y[ok])))
print("sectors used:",sorted((a,s) for a,s,_,_ in S))
rows=[]; steps=[]
for a,s,t,y in S:
    dt=np.median(np.diff(t))
    # bin to 30 min for speed
    nb=max(int(round((0.5/24)/dt)),1); n=len(t)//nb; tb=t[:n*nb].reshape(n,nb).mean(1); yb=y[:n*nb].reshape(n,nb).mean(1)
    jump=np.diff(tb)>0.1; tb_ok=tb
    for tc in np.arange(tb.min()+0.5,tb.max()-0.5,0.05):
        w=np.abs(tb-tc)<1.0
        if w.sum()<40: continue
        x=tb[w]-tc; f=yb[w]; D=-trapezoid(tb[w],tc,DUR)
        if (D<-0.5).sum()<0.7*DUR/0.0208: continue
        M=np.vstack([np.ones_like(x),x,x**2,D]).T; c=np.linalg.lstsq(M,f,rcond=None)[0]; rs=np.std(f-M@c)
        rows.append((a,s,tc,c[3],rs))
    # step scan with 0.3 d windows
    for ts in np.arange(tb.min()+0.3,tb.max()-0.3,0.02):
        L=(tb>ts-0.3)&(tb<ts); Rr=(tb>ts)&(tb<ts+0.3)
        if L.sum()<10 or Rr.sum()<10 or (tb[Rr].min()-tb[L].max())>0.05: continue
        steps.append((a,s,ts,np.mean(yb[Rr])-np.mean(yb[L]),np.std(yb[L])/np.sqrt(L.sum())))
rows=np.array([(s,tc,d,rs) for a,s,tc,d,rs in rows]); 
# per-sector robust sigma of box depths
out={}
sig=np.zeros(len(rows))
for s in np.unique(rows[:,0]):
    m=rows[:,0]==s; d=rows[m,2]; sig[m]=1.4826*np.median(np.abs(d-np.median(d)))
snr=rows[:,2]/sig
def peaks(sgn,thr):
    o=np.argsort(-sgn*snr); used=[]; L=[]
    for k in o:
        if sgn*snr[k]<thr: break
        if any(abs(rows[k,1]-u)<0.5 for u in used): continue
        used.append(rows[k,1]); L.append(dict(sector=int(rows[k,0]),t=round(float(rows[k,1]),3),depth_ppt=round(float(rows[k,2])*1e3,2),snr=round(float(snr[k]),1)))
    return L
dips=peaks(1,4.0); bri=peaks(-1,4.0)
out["n_dips_snr4"]=len(dips); out["n_brightenings_snr4"]=len(bri); out["top_dips"]=dips[:15]; out["top_brightenings"]=bri[:15]
k=np.argmin(np.abs(rows[:,1]-TC)+100*(rows[:,0]!=32)); out["event_box"]=dict(t=float(rows[k,1]),depth_ppt=float(rows[k,2]*1e3),snr=float(snr[k]))
print("event box:",out["event_box"]); print("dips SNR>=4:",len(dips),"brightenings SNR>=4:",len(bri))
for e in dips[:15]: print(" dip",e)
for e in bri[:10]: print(" bright",e)
st=np.array([(s,ts,d,e) for a,s,ts,d,e in steps]); z=st[:,2]/np.maximum(st[:,3],1e-6)
o=np.argsort(-np.abs(st[:,2])); used=[]; L=[]
for k in o:
    if abs(st[k,2])<3e-3: break
    if any(abs(st[k,1]-u)<0.5 for u in used): continue
    used.append(st[k,1]); L.append(dict(sector=int(st[k,0]),t=round(float(st[k,1]),3),step_ppt=round(float(st[k,2])*1e3,2),z=round(float(z[k]),1)))
out["level_shifts_gt3ppt"]=L; print("abrupt level shifts > 3 ppt (0.3 d windows, contiguous data):"); [print(" ",x) for x in L[:25]]
for tt in [3919.94,3932.69]:
    near=[e for e in dips+bri if abs(e["t"]-tt)<0.3]; near_s=[x for x in L if abs(x["t"]-tt)<0.5]; out[f"near_{tt}"]=dict(box=near,steps=near_s); print(tt,near,near_s)
json.dump(out,open("data/step5_search.json","w"),indent=1)
