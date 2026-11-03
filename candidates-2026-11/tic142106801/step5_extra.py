"""(a) Dip/brightening counts from step5_search excluding junk (|depth| > 100 ppt) and the two orbit-start
scattered-light stretches; (b) periodogram 1.5-2.5 c/d (the vet's ~12 h signals) of detrended QLP flux, all sectors joined."""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, json
from astropy.timeseries import LombScargle
from lcio import load_all
o=json.load(open('data/step5_search.json'))
# re-run extrema counting from saved top lists is impossible; recompute from the search by re-importing would be slow,
# so reuse by re-running a compact version
from measure import fit_depth
from common import DUR
recs=[r for r in load_all() if r['author']=='QLP']
ext=[]; T_all=[]; F_all=[]
for r in recs:
    col='KSPSAP_FLUX' if 'KSPSAP_FLUX' in r['flux'] else 'DET_FLUX'
    t=r['t']; f=r['flux'][col]; g=(r['q']==0)&np.isfinite(f)&(f>0.5*np.nanmedian(f))&(f<1.5*np.nanmedian(f)); t=t[g]; f=f[g]/np.nanmedian(f[g])
    tb=np.arange(t.min(),t.max()+1/48,1/48); i=np.digitize(t,tb); u=np.unique(i)
    T=np.array([t[i==k].mean() for k in u]); Fb=np.array([f[i==k].mean() for k in u]); T_all.append(T); F_all.append(Fb-1)
    grid=np.arange(T.min()+0.3,T.max()-0.3,0.05); d=[]
    for tc in grid:
        m=fit_depth(T,Fb,tc,DUR,1.0,2,min_cov=0.8); d.append(m['depth'] if (m is not None and np.isfinite(m.get('depth',np.nan))) else np.nan)
    d=np.array(d); ok=np.isfinite(d); sig=1.4826*np.nanmedian(np.abs(d[ok]-np.nanmedian(d[ok])))
    for k in range(1,len(d)-1):
        if not np.isfinite(d[k]): continue
        nb=d[max(0,k-4):k+5]
        if d[k]==np.nanmax(nb) or d[k]==np.nanmin(nb): ext.append((r['sector'],grid[k],d[k]*1e3,d[k]/sig))
E=np.array(ext,float); res={}
for thr in [3,4.4,6]:
    res[f'dips_ge_{thr}ppt']=int((E[:,2]>=thr).sum()); res[f'bright_ge_{thr}ppt']=int((E[:,2]<=-thr).sum())
for z in [5,6,8]:
    res[f'dips_ge_{z}sig']=int((E[:,3]>=z).sum()); res[f'bright_ge_{z}sig']=int((E[:,3]<=-z).sum())
res['n_extrema']=len(E)
print(res)
T=np.concatenate(T_all); F=np.concatenate(F_all)
fr=np.linspace(0.5,4,20000); ls=LombScargle(T,F); pw=ls.power(fr)
j=np.argsort(-pw)[:5]
res['ls_joined_top']=[dict(f=round(float(fr[k]),4),P_h=round(24/float(fr[k]),2),power=round(float(pw[k]),4)) for k in j]
res['ls_fap_best']=float(ls.false_alarm_probability(pw.max()))
m=ls.model(T,fr[j[0]]); res['amp_best_ppt']=round(float((m.max()-m.min())/2*1e3),3)
print(res)
json.dump(res,open('data/step5_extra.json','w'),indent=1)
