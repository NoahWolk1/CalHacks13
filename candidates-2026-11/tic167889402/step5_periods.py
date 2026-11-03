"""If the S96 dip were real (0.647 ppt, 8 h): which periods survive? An epoch excludes P when the
prewhitened SAP 8 h box there (step5 slide) is < 0.647 - 2*sigma_emp = 0.24 ppt."""
import numpy as np, json
from common import TC
gd,D,S=np.load("data/step5_slide_SAP_FLUX.npy"); sig=0.205; thr=0.647-2*sig
Ps=np.exp(np.arange(np.log(1.0),np.log(3000),2e-5)); allowed=[]
for P in Ps:
    n=np.arange(np.ceil((gd.min()-TC)/P),np.floor((gd.max()-TC)/P)+1); ep=TC+n*P; ep=ep[np.abs(ep-TC)>0.5]
    i=np.searchsorted(gd,ep); i=np.clip(i,1,len(gd)-1); j=np.where(np.abs(gd[i-1]-ep)<np.abs(gd[i]-ep),i-1,i)
    cov=np.abs(gd[j]-ep)<0.06
    allowed.append(not np.any(D[j][cov]<thr))
allowed=np.array(allowed)
def ranges(lo,hi):
    m=(Ps>=lo)&(Ps<hi); return m.sum() and allowed[m].mean()
for lo,hi in [(1,10),(10,30),(30,100),(100,300),(300,1000),(1000,3000)]: print(f"P {lo}-{hi} d: allowed fraction {ranges(lo,hi):.3f}")
# list allowed intervals < 1000 d
edges=np.diff(allowed.astype(int)); st=list(Ps[1:][edges==1]); en=list(Ps[1:][edges==-1])
if allowed[0]: st=[Ps[0]]+st
iv=[(round(a,2),round(b,2)) for a,b in zip(st,en) if a<1000]
print("allowed intervals below 1000 d (first 40):",iv[:40], "n=",len(iv)); print("shortest allowed P:",Ps[allowed].min() if allowed.any() else None)
json.dump(dict(threshold_ppt=thr,frac={f"{lo}-{hi}":float(ranges(lo,hi)) for lo,hi in [(1,10),(10,30),(30,100),(100,300),(300,1000),(1000,3000)]},intervals_below_1000=iv),open("data/step5_periods.json","w"),indent=1)
