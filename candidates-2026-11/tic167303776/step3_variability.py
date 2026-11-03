"""Rotation period (LS on dip-masked SAP) and whether the dips are phased with it (complex periodic variable test)."""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, json
from astropy.timeseries import LombScargle
from lcio import load_all
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
rs=sorted(load_all(authors=["SPOC"]),key=lambda r:r["sector"])
T=[];Y=[];S=[]
for r in rs:
    t,q=r["t"],r["q"]; y=r["SAP_FLUX"]; ok=(q==0)&np.isfinite(y)&np.isfinite(t)
    t,y=t[ok],y[ok]/np.nanmedian(y[ok])
    nb=15; m=len(t)//nb; tb=t[:m*nb].reshape(m,nb).mean(1); yb=np.median(y[:m*nb].reshape(m,nb),1)
    # per-orbit linear detrend using upper-quantile running baseline (2 d)
    base=np.array([np.percentile(yb[np.abs(tb-x)<1.0],80) for x in tb])
    T.append(tb);Y.append(yb/base);S.append(np.full(len(tb),r["sector"]))
T=np.concatenate(T);Y=np.concatenate(Y);S=np.concatenate(S)
np.save("data/sap30.npy",np.vstack([T,Y,S]))
out={}
# LS on raw 30-min SAP (dips included) and on dip-masked
for lab,m in [("all",np.ones(len(T),bool)),("dips masked (y>0.97)",Y>0.97)]:
    f=np.linspace(0.02,6,200000); p=LombScargle(T[m],Y[m]).power(f); k=np.argmax(p)
    top=[];pp=p.copy()
    for _ in range(5):
        k=np.argmax(pp); top.append((round(1/f[k],5),round(float(pp[k]),4))); pp[np.abs(f-f[k])<0.01]=0
    out["LS "+lab]=top; print(lab,top)
P=out["LS all"][0][0]
# refine per year
for y0,y1 in [(1300,1700),(2000,2400),(2950,3250),(3650,4100)]:
    m=(T>y0)&(T<y1); f=np.linspace(1/P-0.02,1/P+0.02,20000); p=LombScargle(T[m],Y[m]).power(f); print("year",y0,"P",1/f[np.argmax(p)]); out[f"P_{y0}"]=float(1/f[np.argmax(p)])
json.dump(out,open("data/step3_variability.json","w"),indent=1)
# dip events: local minima below 0.95
d=[];
for s in np.unique(S):
    m=S==s; t,y=T[m],Y[m]; i=0
    below=y<0.95
    idx=np.where(below)[0]
    if not len(idx): continue
    grp=np.split(idx,np.where(np.diff(idx)>2)[0]+1)
    for g in grp:
        j=g[np.argmin(y[g])]; d.append((t[j],1-y[j],(t[g].max()-t[g].min())*24+0.5,s))
d=np.array(d); np.save("data/dips.npy",d)
print("N dips deeper than 5% (30-min bins):",len(d),"over",len(np.unique(S)),"sectors; depth percentiles 50/90/max",np.percentile(d[:,1],[50,90,100]))
print("dips per day:",len(d)/ (len(T)*0.5/24))
