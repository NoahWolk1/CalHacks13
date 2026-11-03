import warnings; warnings.filterwarnings("ignore")
import numpy as np
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
from lcio import load_all
from common import TC, DUR
lcs=load_all()
for r in lcs: print(r['author'], r['sector'], r['camera'], r['ccd'], len(r['t']), np.nanmin(r['t']).round(2), np.nanmax(r['t']).round(2), r['hdr1'].get('CROWDSAP'), r['hdr1'].get('FLFRCSAP'), [c for c in ['SAP_FLUX','PDCSAP_FLUX','KSPSAP_FLUX','DET_FLUX'] if c in r])
# window plot
sel=[r for r in lcs if r['sector']==31]
fig,ax=plt.subplots(2,1,figsize=(12,8))
off=0
for r in sel:
    for col in ['SAP_FLUX','PDCSAP_FLUX','KSPSAP_FLUX']:
        if col not in r: continue
        t=r['t']; f=r[col]; g=(r['q']==0)&np.isfinite(f)&(np.abs(t-TC)<3)
        if g.sum()<10: continue
        y=(f[g]/np.nanmedian(f[g])-1)*1e3
        # bin to 30 min
        tb=np.arange(TC-3,TC+3,1/48); idx=np.digitize(t[g],tb)
        yb=[np.nanmean(y[idx==i]) if (idx==i).sum()>0 else np.nan for i in range(1,len(tb))]
        ax[0].plot(t[g],y+off,',',color='0.6'); ax[0].plot(tb[:-1]+1/96,np.array(yb)+off,'.-',ms=3,label=f"{r['author']} {col}")
        off-=25
ax[0].axvspan(TC-DUR/2,TC+DUR/2,color='orange',alpha=.2); ax[0].legend(fontsize=7); ax[0].set_ylabel('ppt (offset)')
ax[0].set_title('S31 around BTJD 2145.622, all products (30-min bins)')
r=[r for r in sel if r['author']=='SPOC'][0]; t=r['t']; g=(r['q']==0)&np.isfinite(r['PDCSAP_FLUX'])
ax[1].plot(t[g],(r['PDCSAP_FLUX'][g]/np.nanmedian(r['PDCSAP_FLUX'][g])-1)*1e3,',k'); ax[1].axvline(TC,color='orange'); ax[1].set_title('S31 SPOC PDCSAP full sector'); ax[1].set_ylabel('ppt')
fig.tight_layout(); fig.savefig('figs/step2_window_s31.png',dpi=100)
# all sectors SPOC PDCSAP
sp=[r for r in lcs if r['author']=='SPOC']
fig,axs=plt.subplots(len(sp),1,figsize=(12,2.0*len(sp)))
for a,r in zip(axs,sp):
    t=r['t']; g=(r['q']==0)&np.isfinite(r['PDCSAP_FLUX']); a.plot(t[g],(r['PDCSAP_FLUX'][g]/np.nanmedian(r['PDCSAP_FLUX'][g])-1)*1e3,',k'); a.set_ylabel(f"S{r['sector']}")
    if r['sector']==31: a.axvline(TC,color='orange')
fig.tight_layout(); fig.savefig('figs/step2_all_spoc.png',dpi=80)
