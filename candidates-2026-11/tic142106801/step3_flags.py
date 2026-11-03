"""Around both epochs: QLP quality flags, background, centroids; ELEANOR background and centroids; TGLC background.
Prints 1-h bins and plots them."""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, json
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
from lcio import load_all
from common import TC, DUR, TC2
out={}
for tc,s in [(TC,7),(TC2,87)]:
    recs=[r for r in load_all() if r['sector']==s]
    fig,ax=plt.subplots(5,1,figsize=(10,12),sharex=True)
    for r in recs:
        t=r['t']; w=np.abs(t-tc)<1.5; q=r['q']
        key=f"S{s}_{r['author']}"
        o={}
        ev=np.abs(t-tc)<DUR/2
        fl={}
        for b in range(32):
            n=int(((q[ev]>>b)&1).sum())
            if n: fl[1<<b]=n
        o['flags_in_event']=fl; o['n_event']=int(ev.sum()); o['frac_q0_event']=float((q[ev]==0).mean()) if ev.sum() else None
        flw={}
        for b in range(32):
            n=int(((q[w]>>b)&1).sum())
            if n: flw[1<<b]=n
        o['flags_within_1.5d']=flw
        # flagged-cadence times
        o['flagged_times']=[round(float(x),3) for x in t[w&(q!=0)]][:80]
        tb=np.arange(tc-1.5,tc+1.5,1/24); idx=np.digitize(t,tb)
        def b(y):
            return np.array([np.nanmedian(y[(idx==i)&w]) if ((idx==i)&w).sum()>0 else np.nan for i in range(1,len(tb))])
        tt=tb[:-1]+1/48
        for k,y in list(r['aux'].items()):
            yb=b(y); o[f'{k}_1h']=[None if not np.isfinite(v) else round(float(v),4) for v in yb]
        o['t_1h']=[round(float(x),3) for x in tt]
        out[key]=o
        a=r['author']
        if a=='QLP':
            ax[0].plot(tt,(b(r['flux']['SAP_FLUX'])/np.nanmedian(r['flux']['SAP_FLUX'][w])-1)*1e3,'r.-',label='QLP SAP')
            ax[1].plot(tt,b(r['aux']['SAP_BKG']),'r.-',label='QLP SAP_BKG')
            ax[2].plot(tt,b(r['aux']['SAP_X'])-np.nanmedian(r['aux']['SAP_X'][w]),'r.-',label='QLP X'); ax[2].plot(tt,b(r['aux']['SAP_Y'])-np.nanmedian(r['aux']['SAP_Y'][w]),'m.-',label='QLP Y')
            ax[4].plot(t[w],q[w]>0,'r|',label='QLP q!=0')
        if a=='ELEANOR':
            ax[0].plot(tt,(b(r['flux']['RAW_FLUX'])/np.nanmedian(r['flux']['RAW_FLUX'][w])-1)*1e3,'b.-',label='ELEANOR RAW')
            ax[3].plot(tt,b(r['aux']['FLUX_BKG']),'b.-',label='ELEANOR bkg')
            ax[2].plot(tt,b(r['aux']['X_CENTROID'])-np.nanmedian(r['aux']['X_CENTROID'][w]),'b.-',label='EL X'); ax[2].plot(tt,b(r['aux']['Y_CENTROID'])-np.nanmedian(r['aux']['Y_CENTROID'][w]),'c.-',label='EL Y')
            ax[4].plot(t[w],0.5*(q[w]>0)+0.02,'b|',label='EL q!=0')
        if a=='TGLC':
            ax[0].plot(tt,(b(r['flux']['aperture_flux'])/np.nanmedian(r['flux']['aperture_flux'][w])-1)*1e3,'y.-',label='TGLC aper')
            ax[0].plot(tt,(b(r['flux']['psf_flux'])/np.nanmedian(r['flux']['psf_flux'][w])-1)*1e3,'g.-',label='TGLC psf')
            ax[3].plot(tt,b(r['aux']['background']),'y.-',label='TGLC bkg')
    for a_ in ax:
        a_.axvspan(tc-DUR/2,tc+DUR/2,color='orange',alpha=.2); a_.legend(fontsize=7)
    ax[0].set_ylabel('ppt'); ax[1].set_ylabel('QLP bkg'); ax[2].set_ylabel('centroid px'); ax[3].set_ylabel('bkg'); ax[0].set_title(f'S{s} near {tc} (1 h medians)')
    fig.tight_layout(); fig.savefig(f'figs/step3_flags_s{s}.png',dpi=85)
json.dump(out,open('data/step3_flags.json','w'),indent=0)
for k,o in out.items(): print(k, 'event flags',o['flags_in_event'],'n',o['n_event'],'q0frac',o['frac_q0_event'],'| within1.5d',o['flags_within_1.5d']); print('   flagged',o['flagged_times'][:40])
