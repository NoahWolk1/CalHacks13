import warnings; warnings.filterwarnings("ignore")
import numpy as np, matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
from lcio import load_all
from common import EV, BRIGHT
L=load_all()
evs=dict(EV); evs["bright"]=BRIGHT
for name,tc in evs.items():
    r=[r for r in L if r["t"][np.isfinite(r["t"])].min()-0.5<tc<r["t"][np.isfinite(r["t"])].max()+0.5][0]
    t=r["t"]; w=(np.abs(t-tc)<3)&np.isfinite(r["SAP_FLUX"])
    rows=["SAP_FLUX","KSPSAP_FLUX","KSPSAP_FLUX_SML","KSPSAP_FLUX_LAG","SAP_BKG","SAP_X","SAP_Y"]
    rows=[c for c in rows if c in r]
    fig,ax=plt.subplots(len(rows),1,figsize=(11,13),sharex=True)
    for a,c in zip(ax,rows):
        y=r[c]; good=w&(r["q"]==0); bad=w&(r["q"]!=0)
        yy=(y/np.nanmedian(y[good])-1)*1e3 if "FLUX" in c else y
        a.plot(t[good],yy[good],".",ms=1.5,color="k"); a.plot(t[bad],yy[bad],".",ms=1.5,color="r")
        b=np.arange(tc-3,tc+3,1/24.); idx=np.digitize(t[good],b)
        bm=np.array([(b[i-1]+1/48,np.nanmedian(yy[good][idx==i])) for i in np.unique(idx) if (idx==i).sum()>=3])
        if len(bm): a.plot(bm[:,0],bm[:,1],"c-",lw=1)
        a.set_ylabel(c,fontsize=7); a.axvline(tc,color="orange",alpha=.5)
        lo,hi=np.nanpercentile(yy[good],[0.5,99.5]); a.set_ylim(lo-(hi-lo)*.1,hi+(hi-lo)*.1)
    ax[0].set_title(f"{name}: S{r['sector']} QLP around BTJD {tc} (black q=0, red flagged, cyan 1-h medians)")
    fig.tight_layout(); fig.savefig(f"figs/raw_window_{name}_s{r['sector']}.png",dpi=90); plt.close(fig)
    # numeric: 1-h bins of SAP in +-0.5 d
    y=r["SAP_FLUX"]; good=(np.abs(t-tc)<0.6)&(r["q"]==0)&np.isfinite(y); base=np.nanmedian(y[(np.abs(t-tc)<2)&(np.abs(t-tc)>0.3)&(r["q"]==0)])
    print(name,"S",r["sector"],"cadence(min)",round(np.nanmedian(np.diff(t))*1440,1))
    for b0 in np.arange(tc-0.6,tc+0.6,1/24):
        m=good&(t>=b0)&(t<b0+1/24)
        if m.sum(): print(f"  {b0+1/48:.3f} n={m.sum():2d} SAP {1e3*(np.nanmedian(y[m])/base-1):7.2f}  KSP {1e3*(np.nanmedian(r['KSPSAP_FLUX'][m])-1) if 'KSPSAP_FLUX' in r else np.nan:7.2f}  bkg {np.nanmedian(r['SAP_BKG'][m]):8.1f}  x {np.nanmedian(r['SAP_X'][m]):.3f} y {np.nanmedian(r['SAP_Y'][m]):.3f}")
