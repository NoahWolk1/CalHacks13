"""Are the S96 event and the vet's 'repeats' just pulsation troughs? For each epoch: raw SAP (6 h median) at the
epoch minus the mean of the values 0.6 d either side (a 'trough depth'), its rank among all epochs, and
the depth a 1-d running-median detrend leaves in an 8 h box there."""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, json
from scipy.ndimage import median_filter
from lcio import load_all
from common import TC, DUR
L={r['sector']:r for r in load_all() if r['author']=='SPOC'}
ep=[TC,3069.25,3073.75,3079.58,3094.66,3122.26,3140.90,3701.52,3706.68,3746.57]
allc=[]; allrm=[]; res={}
for sec,r in L.items():
    g=(r['q']==0)&np.isfinite(r['PDCSAP_FLUX']); t=r['t'][g]; f=r['PDCSAP_FLUX'][g]/np.nanmedian(r['PDCSAP_FLUX'][g])
    n=int(round(1.0/(2/1440))); rm=f/median_filter(f,size=n,mode='nearest')   # 1-d running median, as a generic sweep detrender
    def val(x,y,tc,h): k=np.abs(t-tc)<h; return np.nanmean(y[k]) if k.sum()>0.6*(2*h)/(2/1440) else np.nan
    grid=np.arange(t.min()+0.8,t.max()-0.8,0.1)
    for tc in grid:
        c=val(t,f,tc,0.125)-0.5*(val(t,f,tc-0.6,0.125)+val(t,f,tc+0.6,0.125)); d=1-val(t,rm,tc,DUR/2); allc.append(c); allrm.append(d)
    for e in ep:
        if t.min()<e<t.max():
            c=val(t,f,e,0.125)-0.5*(val(t,f,e-0.6,0.125)+val(t,f,e+0.6,0.125)); d=1-val(t,rm,e,DUR/2)
            res[e]=dict(sector=sec,curv_ppt=c*1e3,rm_depth_ppt=d*1e3)
allc=np.array(allc); allrm=np.array(allrm); ok=np.isfinite(allc)&np.isfinite(allrm)
r=np.corrcoef(allc[ok],allrm[ok])[0,1]
print(f"over all epochs: corr(trough curvature, running-median box depth) = {-r:.2f}; running-median depth >=0.647 ppt in {(allrm[ok]>=0.647e-3).sum()} of {ok.sum()} positions, <=-0.647 in {(allrm[ok]<=-0.647e-3).sum()}; deepest: {np.sort(allrm[ok])[-5:]*1e3}")
for e,v in res.items():
    pct=np.mean(allc[ok]<=v['curv_ppt']/1e3)*100
    print(f" {e}: S{v['sector']}, flux minus +-0.6 d mean {v['curv_ppt']:+.2f} ppt (lowest {pct:.1f}% of epochs), 1-d running-median residual depth {v['rm_depth_ppt']:+.2f} ppt (deeper than {np.mean(allrm[ok]<v['rm_depth_ppt']/1e3)*100:.2f}% of positions)")
    v['curv_percentile']=pct
json.dump(dict(corr=-r,frac_rm_dips=float(np.mean(allrm[ok]>=0.647e-3)),frac_rm_bright=float(np.mean(allrm[ok]<=-0.647e-3)),epochs={str(k):v for k,v in res.items()}),open("data/step5_troughs.json","w"),indent=1)
