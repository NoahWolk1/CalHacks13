"""Overview: every light curve, the S30 event window in all columns, and the fold on OGLE-LMC-ECL-51276 (9.8 arcsec, P 4.4669 d)."""
import warnings; warnings.filterwarnings("ignore")
import numpy as np
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
from lcio import load_all
from common import TC, DUR
L=load_all()
for r in L:
    t=r['t']; c='SAP_FLUX'; g=(r['q']==0)&np.isfinite(r[c])&np.isfinite(t)
    y=r[c][g]/np.nanmedian(r[c][g])
    print(r['author'], r['sector'], r['camera'], r['ccd'], g.sum(), round(np.nanmin(t[g]),2), round(np.nanmax(t[g]),2), 'rms_ppt',round(np.std(y)*1e3,1), 'medflux',round(np.nanmedian(r[c][g]),1),'bkg', round(np.nanmedian(r['SAP_BKG'][g]),1) if 'SAP_BKG' in r else None, [k for k in ['KSPSAP_FLUX','TGLC_APER','TGLC_PSF','ELE_CORR','ELE_PCA'] if k in r])
P,T0=4.4668736,2460003.5856-2457000
sel=[r for r in L if r['sector']==30]
fig,ax=plt.subplots(3,1,figsize=(12,12))
off=0
for r in sel:
    for col in ['SAP_FLUX','KSPSAP_FLUX','KSPSAP_FLUX_SML','KSPSAP_FLUX_LAG']:
        if col not in r: continue
        t=r['t']; f=r[col]; g=(r['q']==0)&np.isfinite(f)&(np.abs(t-TC)<3)
        y=(f[g]/np.nanmedian(f[g])-1)*1e3
        ax[0].plot(t[g],y+off,'.',ms=3,label=f"{r['author']} {col}"); off-=80
ax[0].axvspan(TC-DUR/2,TC+DUR/2,color='orange',alpha=.2); ax[0].legend(fontsize=7); ax[0].set_ylabel('ppt (offset)')
for k in range(-2,3):
    for ph in (0,0.5): 
        te=T0+(np.round((TC-T0)/P)+k+ph)*P
        if abs(te-TC)<3: ax[0].axvline(te,color='r',ls=':' if ph else '--')
ax[0].set_title('S30 around BTJD 2131.268 (red: OGLE-LMC-ECL-51276 predicted eclipses)')
r=[r for r in sel if r['author']=='QLP'][0]; t=r['t']; g=(r['q']==0)&np.isfinite(r['SAP_FLUX'])
ax[1].plot(t[g],(r['SAP_FLUX'][g]/np.nanmedian(r['SAP_FLUX'][g])-1)*1e3,'.k',ms=2); ax[1].axvline(TC,color='orange'); ax[1].set_title('S30 QLP SAP full sector')
for r in L:
    if r['author']!='QLP': continue
    t=r['t']; g=(r['q']==0)&np.isfinite(r['SAP_FLUX']); ph=((t[g]-T0)/P+0.25)%1-0.25
    ax[2].plot(ph,(r['SAP_FLUX'][g]/np.nanmedian(r['SAP_FLUX'][g])-1)*1e3,',',alpha=.5)
ax[2].set_ylim(-150,80); ax[2].set_title('all QLP SAP folded on OGLE-LMC-ECL-51276 (P 4.4668736 d)'); ax[2].set_xlabel('phase')
fig.tight_layout(); fig.savefig('figs/step2_look.png',dpi=90)
