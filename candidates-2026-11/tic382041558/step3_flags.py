"""S39 context: quality flags/dumps near the event (TESS-SPOC & QLP), orbit boundaries, TESS-SPOC centroids (flagged cadences kept),
and a Lomb-Scargle of TESS-SPOC PDCSAP per sector (rotation; VSX lists ROT)."""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, json
from astropy.timeseries import LombScargle
from lcio import load_all
from common import TC, DUR
L=load_all(); out={}
for r in L:
    if r['sector']!=39: continue
    t=r['t']; q=r['q']; k=r['author']
    gaps=np.where(np.diff(t)>0.2)[0]; out[f'{k}_gaps']=[(round(float(t[i]),3),round(float(t[i+1]),3)) for i in gaps]
    for bit in [8,32,128]:
        tt=t[(q&bit)>0]; out[f'{k}_bit{bit}_within2d']=sorted(set(round(float(x),2) for x in tt[np.abs(tt-TC)<2]))
    out[f'{k}_flags_values_in_event']={int(v):int((q[np.abs(t-TC)<DUR/2]==v).sum()) for v in np.unique(q[np.abs(t-TC)<DUR/2])}
    if 'MOM_CENTR1' in r:
        w=np.abs(t-TC)<1; ev=np.abs(t-TC)<DUR/2
        c1,c2=r['MOM_CENTR1'],r['MOM_CENTR2']
        for name,c in [('col',c1),('row',c2)]:
            base=w&~(np.abs(t-TC)<0.3)&np.isfinite(c)
            p=np.polyfit(t[base]-TC,c[base],2); res=c-np.polyval(p,t-TC)
            out[f'{k}_centroid_{name}_shift_mpx']=[float(np.nanmean(res[ev])*1e3),float(np.nanstd(res[base])*1e3/np.sqrt(ev.sum()))]
        out[f'{k}_jitter_in_over_out']=float(np.nanstd(np.diff(c1[ev]))/np.nanstd(np.diff(c1[w&~ev])))
# rotation
rot=[]
for r in L:
    if r['author']!='TESS-SPOC': continue
    t=r['t']; f=r['PDCSAP_FLUX']; g=(r['q']==0)&np.isfinite(f)
    if g.sum()<300: continue
    ls=LombScargle(t[g],f[g]/np.median(f[g])); fr,pw=ls.autopower(minimum_frequency=1/13,maximum_frequency=5,samples_per_peak=10)
    i=np.argmax(pw); P=1/fr[i]; amp=np.sqrt(pw[i]*np.var(f[g]/np.median(f[g]))*2)*1e3
    rot.append(dict(sector=int(r['sector']),P_d=round(float(P),2),power=round(float(pw[i]),3),fap=float(ls.false_alarm_probability(pw[i])),amp_ppt_approx=round(float(amp),2),rms_ppt=round(float(np.std(f[g]/np.median(f[g]))*1e3),2)))
out['rotation_per_sector']=rot
print(json.dumps(out,indent=1))
json.dump(out,open('data/step3_flags.json','w'),indent=1)
