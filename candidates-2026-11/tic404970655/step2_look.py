import warnings; warnings.filterwarnings("ignore")
import numpy as np
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
from lcio import load_all
from common import TC, DUR
lcs=load_all()
for r in lcs: print(r['author'], r['sector'], r['camera'], r['ccd'], len(r['t']), np.nanmin(r['t']).round(2), np.nanmax(r['t']).round(2), r['hdr1'].get('CROWDSAP'), r['hdr1'].get('FLFRCSAP'), round(float(np.nanmedian(r['SAP_FLUX'])),1) if 'SAP_FLUX' in r else None, [c for c in ['SAP_FLUX','PDCSAP_FLUX','KSPSAP_FLUX','DET_FLUX'] if c in r])
sel=[r for r in lcs if r['sector']==31]
fig,ax=plt.subplots(2,1,figsize=(13,9))
off=0
for r in sel:
    for col in ['SAP_FLUX','PDCSAP_FLUX','KSPSAP_FLUX']:
        if col not in r: continue
        t=r['t']; f=r[col]; g=(r['q']==0)&np.isfinite(f)&(np.abs(t-TC-3)<6)
        if g.sum()<10: continue
        y=(f[g]/np.nanmedian(f[g])-1)*1e3
        tb=np.arange(TC-3,TC+9,1/24); idx=np.digitize(t[g],tb)
        yb=[np.nanmean(y[idx==i]) if (idx==i).sum()>0 else np.nan for i in range(1,len(tb))]
        ax[0].plot(tb[:-1]+1/48,np.array(yb)+off,'.-',ms=3,label=f"{r['author']} {col}")
        off-=60
for x in [2155.638,2162.137]: ax[0].axvline(x,color='r',ls=':')
ax[0].axvspan(TC-DUR/2,TC+DUR/2,color='orange',alpha=.2); ax[0].legend(fontsize=7); ax[0].set_ylabel('ppt (offset)')
ax[0].set_title('S31 around the event, all products (1-h bins); red: OGLE-predicted primary/secondary')
r=[r for r in sel if r['author']=='SPOC'][0]; t=r['t']; g=(r['q']==0)&np.isfinite(r['PDCSAP_FLUX'])
ax[1].plot(t[g],(r['SAP_FLUX'][g]/np.nanmedian(r['SAP_FLUX'][g])-1)*1e3,',k'); ax[1].axvline(TC,color='orange'); ax[1].set_title('S31 SPOC SAP full sector'); ax[1].set_ylabel('ppt')
fig.tight_layout(); fig.savefig('figs/step2_window_s31.png',dpi=90)
