"""Depth at the sweep epoch (S39) in every product: TESS-SPOC SAP/PDCSAP, QLP SAP/KSPSAP, TARS HLSP.
trapezoid + per-segment quadratic baseline (measure.py), quality==0 only. Also re-centre: grid in tc and duration."""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, json, glob
from astropy.io import fits
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
from lcio import load_all
from measure import measure, fit_depth
from common import TC, DUR
series=[]
for r in load_all():
    if r['sector']!=39: continue
    for col in ["PDCSAP_FLUX","SAP_FLUX","KSPSAP_FLUX"]:
        if col in r:
            g=(r['q']==0)&np.isfinite(r[col])&np.isfinite(r['t']); series.append((f"{r['author']} {col}",r['t'][g],r[col][g]))
f=glob.glob('data/hlsp/**/*tars*s0039*.fits',recursive=True)[0]
d=fits.open(f)[1].data; g=np.isfinite(d['FLUX'])&np.isfinite(d['TIME']); series.append(("TARS FLUX",d['TIME'][g],d['FLUX'][g]))
out=[]
for name,t,fl in series:
    m=measure(t,fl,TC,DUR,win=1.0)
    rec=dict(product=name)
    if m is None or not np.isfinite(m.get('depth',np.nan)): rec['note']='no coverage'; out.append(rec); print(rec); continue
    rec.update(depth_ppt=round(m['depth']*1e3,2),sig_adopt=round(m['sig_adopt']*1e3,2),sig_white=round(m['sig_white']*1e3,2),beta=round(m['beta'],2),
               sig_emp=round(m['sig_emp']*1e3,2),frac_deeper=round(float(m['frac_deeper']),3),cov=round(m['cov'],2))
    # re-centre: grid over tc, dur
    fn=fl/np.nanmedian(fl[np.abs(t-TC)<1])
    best=None
    for tc in np.arange(TC-0.15,TC+0.151,0.005):
        for du in np.arange(0.08,0.42,0.01):
            x=fit_depth(t,fn,tc,du,1.0)
            if x is None or not np.isfinite(x.get('depth',np.nan)): continue
            snr=x['depth']/x['sig_white']
            if best is None or snr>best[0]: best=(snr,tc,du,x['depth'])
    rec['recentred']=dict(tc=round(best[1],3),dur_h=round(best[2]*24,1),depth_ppt=round(best[3]*1e3,2),snr_white=round(best[0],1))
    out.append(rec); print(rec,flush=True)
json.dump(out,open("data/step2_archival.json","w"),indent=1)
fig,ax=plt.subplots(figsize=(11,8)); off=0
for name,t,fl in series:
    w=np.abs(t-TC)<2.5
    if w.sum()<10: continue
    y=(fl[w]/np.nanmedian(fl[w])-1)*1e3; tt=t[w]
    tb=np.arange(TC-2.5,TC+2.5,1/24); i=np.digitize(tt,tb); u=[k for k in range(1,len(tb)) if (i==k).sum()>0]
    ax.plot(tt,y+off,'.',color='0.75',ms=2); ax.plot([tb[k-1]+1/48 for k in u],[np.mean(y[i==k])+off for k in u],'.-',ms=4,label=name); off-=10
ax.axvspan(TC-DUR/2,TC+DUR/2,color='orange',alpha=.2); ax.legend(fontsize=8); ax.set_ylabel('ppt (offset)'); ax.set_title('S39 around BTJD 2367.159, 1 h bins'); ax.set_ylim(off,10)
fig.tight_layout(); fig.savefig('figs/step2_window_s39.png',dpi=100)
