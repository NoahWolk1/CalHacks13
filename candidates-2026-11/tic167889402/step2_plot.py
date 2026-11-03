import numpy as np, matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
from lcio import load_all
from common import TC, DUR
fig,ax=plt.subplots(3,1,figsize=(12,10))
for r in load_all():
    if r["sector"]!=96: continue
    t=r['t']; g=(r['q']==0)
    for col in ["SAP_FLUX","PDCSAP_FLUX","KSPSAP_FLUX"]:
        if col not in r: continue
        f=r[col]/np.nanmedian(r[col][g])
        lab=r['author']+" "+col
        def b(tt,ff,w=1/24.):
            e=np.arange(tt.min(),tt.max(),w); i=np.digitize(tt,e); 
            return np.array([tt[i==k].mean() for k in np.unique(i)]), np.array([ff[i==k].mean() for k in np.unique(i)])
        m=g&np.isfinite(f)
        tb,fb=b(t[m],f[m])
        ax[0].plot(tb,(fb-1)*1e3,'.',ms=3,label=lab)
        w=m&(abs(t-TC)<3); tb,fb=b(t[w],f[w])
        ax[1].plot(tb,(fb-1)*1e3,'.-',ms=3,label=lab)
    if r['author']=="SPOC":
        ax[2].plot(t[g],r['SAP_BKG'][g],',',label='SAP_BKG'); ax2=ax[2].twinx()
        ax2.plot(t[g],r['MOM_CENTR1'][g]-np.nanmedian(r['MOM_CENTR1'][g]),',',c='r'); ax2.plot(t[g],r['MOM_CENTR2'][g]-np.nanmedian(r['MOM_CENTR2'][g]),',',c='g')
        ax2.set_ylim(-0.03,0.03)
for a in ax: a.axvspan(TC-DUR/2,TC+DUR/2,color='y',alpha=.3)
ax[1].set_xlim(TC-3,TC+3); ax[2].set_xlim(TC-3,TC+3); ax[0].legend(fontsize=7); ax[1].legend(fontsize=7)
ax[0].set_ylabel("ppt (1h bins)"); ax[1].set_ylabel("ppt")
plt.savefig("figs/step2_s96_window.png",dpi=110)
