import warnings; warnings.filterwarnings("ignore")
import numpy as np
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
from lcio import load_all
from common import TC, DUR, TC2
lcs=load_all()
for r in lcs: print(r['author'], r['sector'], r['camera'], r['ccd'], len(r['t']), np.nanmin(r['t']).round(2), np.nanmax(r['t']).round(2), list(r['flux']))
for tc,secs,name in [(TC,(7,),'s7'),(TC2,(87,),'s87')]:
    sel=[r for r in lcs if r['sector'] in secs]
    fig,ax=plt.subplots(1,1,figsize=(12,10)); off=0
    for r in sel:
        for col,f in r['flux'].items():
            t=r['t']; g=(r['q']==0)&np.isfinite(f)&(np.abs(t-tc)<2.5)
            if g.sum()<10: continue
            y=(f[g]/np.nanmedian(f[g])-1)*1e3
            tb=np.arange(tc-2.5,tc+2.5,1/24); idx=np.digitize(t[g],tb)
            yb=[np.nanmean(y[idx==i]) if (idx==i).sum()>0 else np.nan for i in range(1,len(tb))]
            ax.plot(t[g],y+off,',',color='0.6'); ax.plot(tb[:-1]+1/48,np.array(yb)+off,'.-',ms=3,label=f"{r['author']} {col}")
            ax.text(tc+2.3,off,f"{r['author']} {col}",fontsize=7)
            off-=12
    ax.axvspan(tc-DUR/2,tc+DUR/2,color='orange',alpha=.2); ax.set_ylabel('ppt (offset)'); ax.set_xlim(tc-2.5,tc+3.2)
    ax.set_title(f'{name} around BTJD {tc}, all products (1-h bins)'); fig.tight_layout(); fig.savefig(f'figs/step2_window_{name}.png',dpi=90)
