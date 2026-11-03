"""Is the S31 trough more extreme than the star's own red-noise variability produces?
Phase-randomised surrogates of each SPOC SAP sector (30-min bins, gaps linearly filled before the FFT, then re-masked)
keep the measured power spectrum. For each realisation of all 10 sectors, slide the 8 h trapezoid on a +-1 d quadratic
baseline (measure.fit_depth) every 0.05 d and keep the deepest dip; compare with the same statistic on the real data."""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, json
from lcio import load_all
from measure import fit_depth
from common import TC, DUR
rng=np.random.default_rng(1)
L=[r for r in load_all() if r['author']=='SPOC']
sect=[]
for r in L:
    g=(r['q']==0)&np.isfinite(r['SAP_FLUX']); t=r['t'][g]; f=r['SAP_FLUX'][g]/np.nanmedian(r['SAP_FLUX'][g])
    tb=np.arange(t.min(),t.max(),1/48); i=np.digitize(t,tb)
    cnt=np.bincount(i,minlength=len(tb)+1)[1:len(tb)+1]; sm=np.bincount(i,weights=f,minlength=len(tb)+1)[1:len(tb)+1]
    ok=cnt>5; y=np.where(ok,sm/np.maximum(cnt,1),np.nan); x=tb+1/96
    yf=y.copy(); yf[~ok]=np.interp(x[~ok],x[ok],y[ok])
    sect.append((int(r['sector']),x,y,yf,ok))
def maxdip(x,y,ok):
    best=(-9,None)
    xs=x[ok]; ys=y[ok]
    for tc in np.arange(xs.min()+0.2,xs.max()-0.2,0.05):
        w=np.abs(xs-tc)<1
        res=fit_depth(xs[w],ys[w]/np.median(ys[w]),tc,DUR,1.0,2,min_cov=0.8)
        if res is None or not np.isfinite(res.get('depth',np.nan)): continue
        if res['depth']>best[0]: best=(res['depth'],tc)
    return best
real=[maxdip(x,y,ok) for s,x,y,yf,ok in sect]
obs=max(real)[0]; print("real per-sector deepest 8h dip (ppt):",[(s,round(d*1e3,2),round(tc,2)) for (s,*_),(d,tc) in zip(sect,real)])
N=200; mx=[]; per_sector=[]
for k in range(N):
    allm=[]
    for s,x,y,yf,ok in sect:
        Fy=np.fft.rfft(yf-yf.mean()); ph=np.exp(2j*np.pi*rng.random(len(Fy))); ph[0]=1
        ys=np.fft.irfft(Fy*ph,n=len(yf))+1
        allm.append(maxdip(x,ys,ok)[0])
    mx.append(max(allm)); per_sector+=allm
mx=np.array(mx); per_sector=np.array(per_sector)
out=dict(observed_max_ppt=obs*1e3,observed_tc=max(real)[1],n_realisations=N,
         p_any_sector_ge_obs=float((mx>=obs).mean()),surrogate_max_median_ppt=float(np.median(mx)*1e3),
         surrogate_max_95pct_ppt=float(np.percentile(mx,95)*1e3),
         p_single_sector_ge_obs=float((per_sector>=obs).mean()))
print(json.dumps(out,indent=1)); json.dump(out,open("data/step5_surrogates.json","w"),indent=1)
