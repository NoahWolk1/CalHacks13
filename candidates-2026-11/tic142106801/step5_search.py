"""All QLP sectors (detrended KSPSAP / DET flux, quality 0): a 6 h box (trapezoid + per-segment quadratic, +-1 d) slid every
0.05 d. Local extrema of the depth series are counted as dips (>0) and brightenings (<0). Also: depths at the epochs predicted
by P = 2187.45 d and its aliases P/n, and a Lomb-Scargle periodogram of the SAP flux per sector."""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, json
from astropy.timeseries import LombScargle
from lcio import load_all
from measure import fit_depth
from common import TC, DUR, TC2
recs=[r for r in load_all() if r['author']=='QLP']
allpos=[]; per_sector={}
for r in recs:
    col='KSPSAP_FLUX' if 'KSPSAP_FLUX' in r['flux'] else 'DET_FLUX'
    t=r['t']; f=r['flux'][col]; g=(r['q']==0)&np.isfinite(f); t=t[g]; f=f[g]/np.nanmedian(f[g])
    # bin to 30 min for speed and uniformity
    tb=np.arange(t.min(),t.max()+1/48,1/48); i=np.digitize(t,tb)
    T=np.array([t[i==k].mean() for k in np.unique(i)]); Fb=np.array([f[i==k].mean() for k in np.unique(i)])
    grid=np.arange(T.min()+0.3,T.max()-0.3,0.05); d=[]
    for tc in grid:
        m=fit_depth(T,Fb,tc,DUR,1.0,2,min_cov=0.8)
        d.append(m['depth'] if (m is not None and np.isfinite(m.get('depth',np.nan))) else np.nan)
    d=np.array(d); ok=np.isfinite(d)
    sig=1.4826*np.nanmedian(np.abs(d[ok]-np.nanmedian(d[ok])))
    per_sector[int(r['sector'])]=dict(sig_box_ppt=round(float(sig)*1e3,3),n_pos=int(ok.sum()),cadence_min=round(float(np.median(np.diff(t)))*1440,1))
    for k in range(1,len(d)-1):
        if not np.isfinite(d[k]): continue
        nbh=d[max(0,k-4):k+5]
        if d[k]==np.nanmax(nbh) or d[k]==np.nanmin(nbh):
            allpos.append((int(r['sector']),float(grid[k]),float(d[k]),float(d[k]/sig)))
    print(r['sector'],per_sector[int(r['sector'])],flush=True)
A=np.array([(a,b,c,e) for a,b,c,e in allpos])
dips=A[A[:,2]>0]; br=A[A[:,2]<0]
out=dict(per_sector=per_sector)
for thr in [3.0,4.0,4.4,6.0]:
    out[f'n_dips_ge_{thr}ppt']=int((dips[:,2]*1e3>=thr).sum()); out[f'n_bright_ge_{thr}ppt']=int((-br[:,2]*1e3>=thr).sum())
for z in [4,5,6]:
    out[f'n_dips_ge_{z}sig']=int((dips[:,3]>=z).sum()); out[f'n_bright_ge_{z}sig']=int((-br[:,3]>=z).sum())
top=dips[np.argsort(-dips[:,3])][:15]; topb=br[np.argsort(br[:,3])][:10]
out['top_dips']=[dict(sector=int(a),t=round(b,3),depth_ppt=round(c*1e3,2),snr=round(e,1)) for a,b,c,e in top]
out['top_bright']=[dict(sector=int(a),t=round(b,3),depth_ppt=round(c*1e3,2),snr=round(e,1)) for a,b,c,e in topb]
for nm,tc in [('TC',TC),('TC2',TC2)]:
    k=np.argmin(np.abs(A[:,1]-tc)); out[f'nearest_extremum_{nm}']=dict(sector=int(A[k,0]),t=round(A[k,1],3),depth_ppt=round(A[k,2]*1e3,2),snr=round(A[k,3],1),
        rank_among_dips=int((dips[:,3]>A[k,3]).sum())+1, n_dips=len(dips))
# alias epochs
P=TC2-TC; al=[]
for n in range(1,41):
    p=P/n; ep=TC+p*np.arange(-5,n+6); cov=[]
    for e in ep:
        for r in recs:
            t=r['t'][r['q']==0]
            if t.min()-0.1<e<t.max()+0.1 and (np.abs(t-e)<DUR/2).sum()>0.5*DUR/np.median(np.diff(t)): cov.append(round(float(e),2)); break
    extra=[e for e in cov if abs(e-TC)>0.3 and abs(e-TC2)>0.3]
    al.append(dict(n=n,P=round(p,3),covered_extra_epochs=extra))
out['aliases_P_over_n']=al
out['allowed_n']=[a['n'] for a in al if not a['covered_extra_epochs']]
# periodogram of SAP (variability)
pk=[]
for r in recs:
    t=r['t']; f=r['flux']['SAP_FLUX']; g=(r['q']==0)&np.isfinite(f)
    if g.sum()<200: continue
    y=f[g]/np.median(f[g])-1; tt=t[g]
    # remove per-orbit quadratic
    for idx in [tt<np.median(tt),tt>=np.median(tt)]:
        c=np.polyfit(tt[idx]-tt[idx].mean(),y[idx],2); y[idx]-=np.polyval(c,tt[idx]-tt[idx].mean())
    fr=np.linspace(0.1,12,5000); pw=LombScargle(tt,y).power(fr,method='fast')
    j=np.argmax(pw); amp=np.sqrt(4*pw[j]*np.var(y))  # approx semi-amplitude
    pk.append(dict(sector=int(r['sector']),f_peak=round(float(fr[j]),3),P_h=round(24/float(fr[j]),2),power=round(float(pw[j]),3),approx_amp_ppt=round(float(amp)*1e3/np.sqrt(2),2)))
out['sap_periodogram_peaks']=pk
json.dump(out,open('data/step5_search.json','w'),indent=1)
print(json.dumps({k:v for k,v in out.items() if k not in('per_sector','aliases_P_over_n')},indent=0))
print('allowed n',out['allowed_n'])
