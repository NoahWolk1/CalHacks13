"""All sectors: slide the sweep statistic (6 h trapezoid, +-1 d per-segment quadratic, q==0) every 0.04 d over every
QLP sector (SAP) and TESS-SPOC sector (PDCSAP and SAP). Record local extrema of both signs (dips and brightenings),
with S/N = depth / (sig_white*beta). Count dips vs brightenings at the event's size."""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, json
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
from lcio import load_all
from measure import fit_depth
from common import TC, DUR
rows=[]; series={}
for r in load_all():
    cols=['SAP_FLUX'] if r['author']=='QLP' else ['PDCSAP_FLUX','SAP_FLUX']
    for col in cols:
        t=r['t']; f=r[col]; g=(r['q']==0)&np.isfinite(f)&np.isfinite(t)
        if r['author']=='TESS-SPOC' and col=='SAP_FLUX': g=((r['q']&~4096)==0)&np.isfinite(f)&np.isfinite(t)
        t=t[g]; f=f/np.nanmedian(f[g]); f=f[g]
        if len(t)<100: continue
        # bin QLP 200 s data to 10 min for speed
        if np.nanmedian(np.diff(t))<0.005:
            tb=np.arange(t.min(),t.max()+1/144,1/144); i=np.digitize(t,tb); u=np.unique(i)
            t=np.array([t[i==k].mean() for k in u]); f=np.array([f[i==k].mean() for k in u])
        key=f"{r['author']} {col} S{r['sector']}"
        grid=np.arange(t.min()+0.15,t.max()-0.15,0.04); D=[];S=[];T=[]
        for tc in grid:
            x=fit_depth(t,f,tc,DUR,1.0,min_cov=0.7)
            if x is None or not np.isfinite(x.get('depth',np.nan)): continue
            D.append(x['depth']); S.append(x['sig_white']*x['beta']); T.append(tc)
        D=np.array(D);S=np.array(S);T=np.array(T)
        series[key]=(T,D,S)
        # local extrema, separated by >= 0.5 d
        for sign in [1,-1]:
            z=sign*D/S; order=np.argsort(-z); taken=[]
            for k in order:
                if z[k]<3: break
                if any(abs(T[k]-x)<0.5 for x in taken): continue
                taken.append(T[k]); rows.append(dict(key=key,author=r['author'],col=col,sector=int(r['sector']),tc=round(float(T[k]),3),depth_ppt=round(float(D[k])*1e3,2),snr=round(float(sign*z[k]),2),sign=sign))
        print(key,len(T),flush=True)
json.dump(rows,open("data/step5_search.json","w"),indent=1)
