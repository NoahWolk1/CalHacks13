"""Why QLP sees a smaller amplitude: regress QLP SAP on SPOC SAP (1-h bins) per sector -> dilution factor."""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, json
from lcio import load_all
L=load_all(); out=[]
def bin1h(t,f):
    tb=np.arange(np.floor(t.min()),t.max()+1/24,1/24); i=np.digitize(t,tb)
    u=np.unique(i); return tb[u-1]+1/48, np.array([np.nanmean(f[i==k]) for k in u]), np.array([(i==k).sum() for k in u])
for s in [28,29,30,31,32,33,35,36,38,39]:
    sp=[r for r in L if r['author']=='SPOC' and r['sector']==s][0]
    for au in ['QLP','TESS-SPOC']:
        ql=[r for r in L if r['author']==au and r['sector']==s]
        if not ql: continue
        ql=ql[0]
        g=(sp['q']==0)&np.isfinite(sp['SAP_FLUX']); t1,f1,n1=bin1h(sp['t'][g],sp['SAP_FLUX'][g]/np.nanmedian(sp['SAP_FLUX'][g]))
        g2=(ql['q']==0)&np.isfinite(ql['SAP_FLUX']); t2,f2,n2=bin1h(ql['t'][g2],ql['SAP_FLUX'][g2]/np.nanmedian(ql['SAP_FLUX'][g2]))
        common=np.intersect1d(np.round(t1,4),np.round(t2,4))
        a=np.isin(np.round(t1,4),common)&(n1>15); b=np.isin(np.round(t2,4),common)
        x=dict(zip(np.round(t1[a],4),f1[a])); y=dict(zip(np.round(t2[b],4),f2[b])); k=[c for c in x if c in y]
        X=np.array([x[c] for c in k])-1; Y=np.array([y[c] for c in k])-1
        # remove per-orbit linear trends from both
        tt=np.array(k); orb=tt>np.median(tt)
        for arr in (X,Y):
            for o in (orb,~orb):
                c=np.polyfit(tt[o]-tt[o].mean(),arr[o],1); arr[o]-=np.polyval(c,tt[o]-tt[o].mean())
        slope=np.dot(X,Y)/np.dot(X,X); r=np.corrcoef(X,Y)[0,1]
        d=dict(sector=s,product=au,n=len(k),slope_vs_spoc_sap=round(float(slope),3),r=round(float(r),3),raw_median=float(np.nanmedian(ql['SAP_FLUX'][g2])))
        out.append(d); print(d)
json.dump(out,open("data/step2_qlp_vs_spoc.json","w"),indent=1)
