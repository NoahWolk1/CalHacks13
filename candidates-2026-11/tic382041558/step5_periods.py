"""Periods still allowed: P in [5, 2700] d is excluded if any other epoch TC+nP (n != 0) has >=70% in-transit coverage
(6 h) in QLP or TESS-SPOC q==0 data (TESS-SPOC 4096 cadences allowed). Search shows no other >=3 ppt 6 h dip in TESS-SPOC PDCSAP."""
import numpy as np, json
from lcio import load_all
from common import TC, DUR
T=[]
for r in load_all():
    for col in (['SAP_FLUX'] if r['author']=='QLP' else ['SAP_FLUX']):
        g=np.isfinite(r[col])&(((r['q']&~4096)==0) if r['author']=='TESS-SPOC' else (r['q']==0))
        T.append(r['t'][g])
t=np.sort(np.concatenate(T)); t=t[np.abs(t-TC)>0.5]
# coverage function: fraction of 30-min slots within +-DUR/2 that have data
slots=np.arange(-DUR/2+1/96,DUR/2,1/48)
def cov(tc):
    i=np.searchsorted(t,tc+slots-1/96); j=np.searchsorted(t,tc+slots+1/96); return np.mean(j>i)
Ps=np.exp(np.linspace(np.log(5),np.log(2700),20000)); allowed=[]
tmin,tmax=t.min(),t.max()
for P in Ps:
    ns=np.arange(np.ceil((tmin-TC)/P)-1,np.floor((tmax-TC)/P)+2); ns=ns[ns!=0]
    ok=all(cov(TC+n*P)<0.7 for n in ns)
    allowed.append(ok)
allowed=np.array(allowed)
# summarise allowed intervals
iv=[]; k=0
while k<len(Ps):
    if allowed[k]:
        j=k
        while j+1<len(Ps) and allowed[j+1]: j+=1
        iv.append((round(float(Ps[k]),2),round(float(Ps[j]),2))); k=j+1
    else: k+=1
out=dict(data_span=[float(tmin),float(tmax)],n_allowed_intervals=len(iv),allowed_intervals=iv,
         allowed_frac_log_5_2700=float(allowed.mean()),
         min_allowed_P=float(Ps[allowed].min()) if allowed.any() else None,
         allowed_frac_by_decade={f"{a}-{b}":float(allowed[(Ps>=a)&(Ps<b)].mean()) for a,b in [(5,24),(24,100),(100,300),(300,1000),(1000,2700)]})
print(json.dumps({k:v for k,v in out.items() if k!='allowed_intervals'},indent=1)); print(iv[:40])
json.dump(out,open('data/step5_periods.json','w'),indent=1)
