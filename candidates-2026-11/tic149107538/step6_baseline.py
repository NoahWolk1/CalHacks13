"""How the S67 dip depends on how the rotational minimum is modelled: harmonic model (P 6.104 d, orbit 1) fitted
(i) jointly with the trapezoid, (ii) with +-0.25/0.5/0.75 d masked then the box depth on residuals; (iii) harmonics up to 2,3,4,5."""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, json
from lcio import load_all
from measure import trapezoid
from common import TC, DUR
P=6.104
def harm(t,nh=3):
    tm=t.mean(); x=(t-tm)/(t.max()-t.min()); cols=[x**k for k in range(3)]
    for h in range(1,nh+1):
        for a in (np.sin,np.cos):
            b=a(2*np.pi*h*(t-tm)/P); cols+=[b,b*x]
    return np.vstack(cols).T
r=load_all(authors=["TESS-SPOC"],sectors=[67])[0]
t=r['t']; f=r['SAP_FLUX']; g=(r['q']==0)&np.isfinite(f)&(t<3134.5); t=t[g]; y=f[g]/np.median(f[g])-1
s=trapezoid(t,TC,DUR); out=[]
for nh in [2,3,4,5]:
    H=harm(t,nh); A=np.column_stack([H,-s]); c,*_=np.linalg.lstsq(A,y,rcond=None)
    rec=dict(n_harm=nh,joint_ppt=round(c[-1]*1e3,3))
    for mk in [0.25,0.5,0.75]:
        m=np.abs(t-TC)>mk; c2,*_=np.linalg.lstsq(H[m],y[m],rcond=None); rr=y-H@c2
        rec[f"masked{mk}_box_ppt"]=round(float(-np.mean(rr[s>0.5]))*1e3,3)
    out.append(rec); print(rec)
json.dump(out,open("data/step6_baseline.json","w"),indent=1)
