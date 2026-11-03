import warnings; warnings.filterwarnings("ignore")
import numpy as np
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
from lcio import load_all
from common import TC, DUR
T2=3946.77
lcs=load_all()
fig,axs=plt.subplots(3,1,figsize=(13,13))
for ax,(sec,tc) in zip(axs[:2],[(3,TC),(97,T2)]):
    off=0
    for r in [x for x in lcs if x['sector']==sec]:
        for col in ['SAP_FLUX','PDCSAP_FLUX','KSPSAP_FLUX','DET_FLUX']:
            if col not in r: continue
            t=r['t']; f=r[col]; g=(r['q']==0)&np.isfinite(f)&(np.abs(t-tc)<4)
            if g.sum()<10: continue
            y=(f[g]/np.nanmedian(f[g])-1)*1e3
            tb=np.arange(tc-4,tc+4,1/24); idx=np.digitize(t[g],tb)
            yb=[np.nanmean(y[idx==i]) if (idx==i).sum()>0 else np.nan for i in range(1,len(tb))]
            ax.plot(tb[:-1]+1/48,np.array(yb)+off,'.-',ms=3,label=f"{r['author']} {col}")
            off-=40 if col!='SAP_FLUX' else 40
    ax.axvspan(tc-DUR/2,tc+DUR/2,color='orange',alpha=.2); ax.legend(fontsize=7); ax.set_ylabel('ppt of aperture flux (offset)'); ax.set_title(f'S{sec} around {tc} (1-h bins); NOTE: ppt of the whole aperture, not crowding-corrected except PDCSAP')
r=[x for x in lcs if x['author']=='SPOC' and x['sector']==3][0]; t=r['t']; g=(r['q']==0)&np.isfinite(r['SAP_FLUX'])
axs[2].plot(t[g],(r['SAP_FLUX'][g]/np.nanmedian(r['SAP_FLUX'][g])-1)*1e3,',k'); axs[2].axvline(TC,color='orange'); axs[2].set_title('S3 SPOC SAP full sector (ppt of aperture)')
fig.tight_layout(); fig.savefig('figs/step2_windows.png',dpi=85)
