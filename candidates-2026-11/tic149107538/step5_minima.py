"""Where do the sweep event and the vet's 'recovered' dips sit on the rotation curve?
For each time: nearest local minimum of the 12 h-smoothed SAP light curve, offset from it, and the fraction
of the rotation cycle (6.104 d) that lies within that offset of a minimum (chance probability)."""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, json
from scipy.ndimage import median_filter, uniform_filter1d
from lcio import load_all
from common import TC
P=6.104
times=[TC,3048.54,3055.79,3060.62,3103.26,3115.43,3720.74,3912.76,3918.51,3924.76,3930.84]
lcs=load_all(authors=["TESS-SPOC","SPOC","QLP"])
out=[]
for T in times:
    best=None
    for r in lcs:
        t=r['t']; f=r['SAP_FLUX']; g=(r['q']==0)&np.isfinite(f)&np.isfinite(t)
        t=t[g]; f=f[g]
        if not (t.min()<T<t.max()): continue
        if r['author']=='QLP' and any(x['author']!='QLP' and x['t'][np.isfinite(x['t'])].min()<T<x['t'][np.isfinite(x['t'])].max() for x in lcs): continue
        dt=np.median(np.diff(t)); n=max(int(0.5/dt),3)
        s=uniform_filter1d(median_filter(f,n|1,mode='nearest'),n,mode='nearest')
        w=np.abs(t-T)<P/2
        tw=t[w]; sw=s[w]
        # local minima: lowest point within +-1.5 d
        mins=[i for i in range(len(tw)) if sw[i]==sw[np.abs(tw-tw[i])<1.5].min() and np.abs(tw-tw[i]).max()>0]
        maxs=[i for i in range(len(tw)) if sw[i]==sw[np.abs(tw-tw[i])<1.5].max()]
        if not mins: continue
        tm=tw[mins]; dmin=tm[np.argmin(np.abs(tm-T))]-T
        tM=tw[maxs] if maxs else np.array([np.nan]); dmax=np.nanmin(np.abs(tM-T))
        lev=(np.interp(T,t,s)-np.percentile(sw,2))/(np.percentile(sw,98)-np.percentile(sw,2))
        best=dict(t=T,author=r['author'],sector=int(r['sector']),offset_from_min_d=round(float(dmin),3),dist_to_max_d=round(float(dmax),3),
                  level_0min_1max=round(float(lev),2))
        break
    out.append(best); print(best)
lev=np.array([o['level_0min_1max'] for o in out if o]); print("levels:",lev, "fraction in bottom 20% of range:",np.mean(lev<0.2))
json.dump(out,open("data/step5_minima.json","w"),indent=1)
