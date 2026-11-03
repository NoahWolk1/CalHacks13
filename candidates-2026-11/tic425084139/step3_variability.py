"""Characterise the variability (10 SPOC 2-min sectors) and ask whether the S30 dip is just one of its troughs.
(a) amplitude spectrum per sector + Bowman et al. (2019) red-noise profile fit;
(b) the sweep's own statistic (6 h trapezoid on a +-1 d quadratic baseline, measure.fit_depth) slid over all
    sectors every 0.05 d -> rank of the S30 event among all 8 h 'dips'."""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, json
from astropy.timeseries import LombScargle
from scipy.optimize import curve_fit
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
from lcio import load_all
from measure import fit_depth
from common import TC, DUR
L=[r for r in load_all() if r['author']=='SPOC']
out={}
fig,axs=plt.subplots(2,2,figsize=(14,9))
freqs=np.linspace(0.02,24,6000)   # c/d
amps=[]; allpk=[]
for r in L:
    for col in ['PDCSAP_FLUX','SAP_FLUX']:
        t=r['t']; f=r[col]; g=(r['q']==0)&np.isfinite(f)
        y=(f[g]/np.nanmedian(f[g])-1)
        p=LombScargle(t[g],y,normalization='psd').power(freqs)
        A=np.sqrt(4*p/g.sum())*1e3      # amplitude, ppt
        if col=='PDCSAP_FLUX':
            amps.append(A); i=np.argmax(A[freqs>0.1]); allpk.append((int(r['sector']),float(freqs[freqs>0.1][i]),float(A[freqs>0.1][i])))
amps=np.array(amps); Am=np.median(amps,0)
def prof(nu,a0,nuc,gam,cw): return a0/(1+(nu/nuc)**gam)+cw
popt,pcov=curve_fit(prof,freqs,Am,p0=[3,0.5,2,0.05],bounds=([0,0.01,0.5,0],[50,10,8,5]))
out['red_noise_fit']=dict(alpha0_ppt=popt[0],nu_char_cd=popt[1],gamma=popt[2],Cw_ppt=popt[3],tau_char_d=1/(2*np.pi*popt[1]))
out['highest_peak_per_sector']=allpk
# coherent? compare peak frequencies across sectors
out['peak_freq_spread']=dict(min=min(p[1] for p in allpk),max=max(p[1] for p in allpk))
rms=[]; 
for r in L:
    t=r['t']; f=r['PDCSAP_FLUX']; g=(r['q']==0)&np.isfinite(f); rms.append(float(np.std(f[g]/np.nanmedian(f[g]))*1e3))
out['pdcsap_rms_ppt_per_sector']=dict(zip([int(r['sector']) for r in L],[round(x,2) for x in rms]))
ax=axs[0,0]; [ax.loglog(freqs,a,color='0.8',lw=.5) for a in amps]; ax.loglog(freqs,Am,'k',lw=1); ax.loglog(freqs,prof(freqs,*popt),'r')
ax.axvline(1/DUR,color='orange',ls='--',label='1/(6 h)'); ax.set_xlabel('c/d'); ax.set_ylabel('amplitude ppt'); ax.legend(); ax.set_title(f"SPOC PDCSAP, all SPOC 2-min sectors; red-noise fit nu_char={popt[1]:.2f} c/d, gamma={popt[2]:.2f}, a0={popt[0]:.1f} ppt")
# (b) sliding dip statistic
rows=[]
for r in L:
    for col in ['PDCSAP_FLUX','SAP_FLUX']:
        t=r['t']; f=r[col]; g=(r['q']==0)&np.isfinite(f); t=t[g]; f=f[g]/np.nanmedian(f[g])
        for tc in np.arange(t.min()+0.2,t.max()-0.2,0.05):
            w=np.abs(t-tc)<1
            res=fit_depth(t[w],f[w]/np.median(f[w]),tc,DUR,1.0,2,min_cov=0.8)
            if res is None or not np.isfinite(res.get('depth',np.nan)): continue
            rows.append((int(r['sector']),col,tc,res['depth']*1e3,res['depth']/res['sig_white']))
R=np.array([(x[0],0 if x[1]=='PDCSAP_FLUX' else 1,x[2],x[3],x[4]) for x in rows])
for ci,col in enumerate(['PDCSAP_FLUX','SAP_FLUX']):
    S=R[R[:,1]==ci]
    # local maxima (independent dips): take the max within +-0.3 d
    order=np.argsort(-S[:,3]); used=[]; peaks=[]
    for i in order:
        if any(abs(S[i,2]-u_)<0.4 for u_ in used): continue
        used.append(S[i,2]); peaks.append(S[i])
    peaks=np.array(peaks)
    ev=peaks[np.argmin(np.abs(peaks[:,2]-TC))]
    rank=int((peaks[:,3]>=ev[3]).sum())
    out[f'dip_scan_{col}']=dict(event_tc=float(ev[2]),event_depth_ppt=float(ev[3]),event_snr_white=float(ev[4]),rank=rank,n_independent=len(peaks),
        n_deeper_than_event=int((peaks[:,3]>ev[3]).sum()),n_ge_7ppt=int((peaks[:,3]>=7).sum()),
        days=float(sum((r['t'][(r['q']==0)].max()-r['t'][(r['q']==0)].min()) for r in L)),
        top10=[(int(p[0]),round(float(p[2]),2),round(float(p[3]),2),round(float(p[4]),1)) for p in peaks[:10]],
        deepest_brightening=[(int(p[0]),round(float(p[2]),2),round(float(p[3]),2)) for p in peaks[-3:]])
    a=axs[0,1] if ci==0 else axs[1,0]
    a.hist(peaks[:,3],bins=60,color='0.5'); a.axvline(ev[3],color='orange',lw=2,label=f'S30 event {ev[3]:.1f} ppt (rank {rank}/{len(peaks)})')
    a.set_xlabel('6 h box depth on +-1 d quadratic baseline [ppt]'); a.set_title(f'{col}: all local extrema, all SPOC 2-min sectors'); a.legend()
json.dump(out,open('data/step3_variability.json','w'),indent=1,default=float)
print(json.dumps(out,indent=1,default=float))
# panel: the event next to a few other troughs
S=R[R[:,1]==0]
ax=axs[1,1]
top=out['dip_scan_PDCSAP_FLUX']['top10'][:6]
for k,(s,tc,d,snr) in enumerate(top):
    r=[x for x in L if x['sector']==s][0]; t=r['t']; f=r['PDCSAP_FLUX']; g=(r['q']==0)&np.isfinite(f)&(np.abs(t-tc)<1.5)
    tb=np.arange(tc-1.5,tc+1.5,1/24); i=np.digitize(t[g],tb); yb=[np.mean(f[g][i==j]) for j in range(1,len(tb)) if (i==j).sum()>5]; xb=[tb[j-1]-tc for j in range(1,len(tb)) if (i==j).sum()>5]
    yb=np.array(yb)/np.median(yb); ax.plot(xb,(yb-1)*1e3-30*k,'.-',ms=3,label=f'S{s} {tc:.2f}: {d:.1f} ppt'+(' <- sweep event' if abs(tc-TC)<0.3 else ''))
ax.axvspan(-DUR/2,DUR/2,color='orange',alpha=.2); ax.legend(fontsize=7); ax.set_xlabel('days from trough'); ax.set_title('the six deepest 6 h "dips" in PDCSAP (1 h bins, offset)')
fig.tight_layout(); fig.savefig('figs/step3_variability.png',dpi=90)
