"""TESS-SPOC flags the whole event 4096 (scattered-light exclude). Measure TESS-SPOC SAP/PDCSAP ignoring that bit,
and test QLP flux against QLP's own background estimate (regression) around the event."""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, json
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
from lcio import load_all
from measure import measure, trapezoid
from common import TC, DUR
out={}
L={r['author']:r for r in load_all() if r['sector']==39}
s=L['TESS-SPOC']; t=s['t']; q=s['q']
ev=np.abs(t-TC)<DUR/2
out['spoc_flags_in_event']={int(1<<b):int(((q[ev]>>b)&1).sum()) for b in range(16) if ((q[ev]>>b)&1).sum()}
out['spoc_n_event']=int(ev.sum())
fl4096=(q&4096)>0
# contiguous 4096 intervals in S39
idx=np.where(fl4096)[0]; br=np.where(np.diff(idx)>1)[0]
iv=[(float(t[idx[a]]),float(t[idx[b]])) for a,b in zip(np.r_[0,br+1],np.r_[br,len(idx)-1])] if len(idx) else []
out['spoc_4096_intervals']=[(round(a,3),round(b,3)) for a,b in iv]
for col in ['SAP_FLUX','PDCSAP_FLUX']:
    g=((q & ~4096)==0)&np.isfinite(s[col])
    m=measure(t[g],s[col][g],TC,DUR,win=1.0)
    out[f'spoc_{col}_ignore4096']=None if m is None or not np.isfinite(m.get('depth',np.nan)) else dict(depth_ppt=round(m['depth']*1e3,2),sig=round(m['sig_adopt']*1e3,2),frac_deeper=round(float(m['frac_deeper']),3),cov=round(m['cov'],2))
print(json.dumps(out,indent=1))
# SPOC background scale vs flux
g=np.isfinite(s['SAP_FLUX'])
out['spoc_sap_median_e_s']=float(np.nanmedian(s['SAP_FLUX'][g])); out['spoc_bkg_median_e_s']=float(np.nanmedian(s['SAP_BKG'][g]))
# QLP: flux vs background
Q=L['QLP']; tq=Q['t']; gq=(Q['q']==0)&np.isfinite(Q['SAP_FLUX'])
w=gq&(np.abs(tq-TC)<1.0)
x=Q['SAP_BKG'][w]; y=Q['SAP_FLUX'][w]/np.median(Q['SAP_FLUX'][w])-1; tt=tq[w]
S=trapezoid(tt,TC,DUR)
A0=np.vstack([np.ones_like(tt),tt-TC,(tt-TC)**2]).T
def fit(A):
    c,*_=np.linalg.lstsq(A,y,rcond=None); r=y-A@c; n=len(y); k=A.shape[1]
    return c, n*np.log(np.mean(r**2))+k*np.log(n), np.sqrt(np.diag(np.linalg.pinv(A.T@A))*np.mean(r**2))
res={}
for name,A in [('poly',A0),('poly+box',np.c_[A0,-S]),('poly+bkg',np.c_[A0,x]),('poly+bkg+box',np.c_[A0,x,-S])]:
    c,bic,e=fit(A); res[name]=dict(bic=round(float(bic),1),coef=[float(v) for v in c],err=[float(v) for v in e])
out['qlp_regression']=res
out['qlp_r_flux_bkg_pm1d']=float(np.corrcoef(x,y)[0,1])
out['qlp_bkg_range_pm1d']=[float(x.min()),float(x.max())]
out['qlp_box_depth_ppt_with_bkg']=round(res['poly+bkg+box']['coef'][-1]*1e3,2); out['qlp_box_err_ppt_with_bkg']=round(res['poly+bkg+box']['err'][-1]*1e3,2)
out['qlp_bkg_coef_ppt_per_1000']=round(res['poly+bkg']['coef'][-1]*1e6,3)
print(json.dumps({k:v for k,v in out.items() if k.startswith('qlp') or k.startswith('spoc_s')},indent=1))
json.dump(out,open('data/step2_flagged.json','w'),indent=1)
fig,ax=plt.subplots(3,1,figsize=(10,9),sharex=True)
w2=np.abs(t-TC)<2.5
for col,c in [('SAP_FLUX','k'),('PDCSAP_FLUX','b')]:
    y2=s[col][w2]/np.nanmedian(s[col][w2])-1; ax[0].plot(t[w2],y2*1e3,'.',color=c,ms=3,label='TESS-SPOC '+col)
ax[0].plot(t[w2&fl4096],np.zeros((w2&fl4096).sum())-8,'r|',label='flag 4096')
ax[0].legend(fontsize=7); ax[0].set_ylabel('ppt')
w3=np.abs(tq-TC)<2.5
ax[1].plot(tq[w3],(Q['SAP_FLUX'][w3]/np.nanmedian(Q['SAP_FLUX'][w3])-1)*1e3,'g.',ms=3,label='QLP SAP'); ax[1].legend(fontsize=7); ax[1].set_ylabel('ppt')
ax[2].plot(tq[w3],Q['SAP_BKG'][w3],'g.',ms=3,label='QLP SAP_BKG'); ax[2].plot(t[w2],s['SAP_BKG'][w2],'k.',ms=3,label='TESS-SPOC SAP_BKG (aperture sum)'); ax[2].legend(fontsize=7)
for a in ax: a.axvspan(TC-DUR/2,TC+DUR/2,color='orange',alpha=.2)
fig.tight_layout(); fig.savefig('figs/step2_flagged_bkg.png',dpi=100)
