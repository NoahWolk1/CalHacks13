"""Ephemeris of the 18.66-d eclipses: grid in (P, T0) maximising the mean 4 h box depth over all QLP epochs (EB-masked, detrended),
then: secondary eclipse at every phase, odd/even, per-sector depths, folded profile and a trapezoid fit (duration, ingress)."""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, json
from scipy.ndimage import median_filter
from scipy.optimize import least_squares
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
from lcio import load_all
from common import TC, DUR
eb=json.load(open("data/step5_eb.json")); P5,T05,ps5=eb['P'],eb['T0_btjd'],eb['secondary_phase']
T=[];D=[];Sx=[]
for r in load_all(["QLP"]):
    if r['sector']>=96: continue
    t=r['t']; f=r['SAP_FLUX']; g=(r['q']==0)&np.isfinite(f); t=t[g]; f=f[g]/np.nanmedian(f[g])
    ph=((t-T05)/P5)%1; m=~((np.minimum(ph,1-ph)*P5<0.3)|(np.abs(ph-ps5)*P5<0.3)); t=t[m]; f=f[m]
    dt=np.median(np.diff(t)); n=int(round(2.0/dt))|1
    # detrend with the eclipses at the trial ephemeris masked (iterated below)
    T.append(t); D.append(f); Sx.append(np.full(len(t),r['sector']))
T=np.concatenate(T); Fr=np.concatenate(D); Sx=np.concatenate(Sx)
def detrend(P,T0,hw=0.25):
    out=np.empty_like(Fr)
    for s in np.unique(Sx):
        m=Sx==s; t=T[m]; f=Fr[m].copy(); ph=((t-T0)/P+0.5)%1-0.5; ine=np.abs(ph*P)<hw
        ff=f.copy(); ff[ine]=np.nan
        # running median ignoring NaN: interpolate masked points first
        ff[ine]=np.interp(t[ine],t[~ine],f[~ine]); dt=np.median(np.diff(t)); n=int(round(1.5/dt))|1
        out[m]=f/median_filter(ff,size=n,mode='nearest')-1
    return out
P,T0=18.6604,TC
D=detrend(P,T0)
def score(P,T0,D):
    ph=((T-T0)/P+0.5)%1-0.5; return -np.mean(D[np.abs(ph*P)<0.06])
best=(-1,None)
for Pp in np.arange(18.64,18.68,0.0002):
    for t0 in np.arange(TC-0.08,TC+0.08,0.004):
        s=score(Pp,t0,D)
        if s>best[0]: best=(s,(Pp,t0))
P,T0=best[1]; D=detrend(P,T0)
best=(-1,None)
for Pp in np.arange(P-0.002,P+0.002,0.00002):
    for t0 in np.arange(T0-0.02,T0+0.02,0.001):
        s=score(Pp,t0,D)
        if s>best[0]: best=(s,(Pp,t0))
P,T0=best[1]; D=detrend(P,T0)
ph=((T-T0)/P+0.5)%1-0.5; x=ph*P*24
# trapezoid fit of folded profile
m=np.abs(x)<14
def trap(p,x):
    d,T14,Tin,c=p; a=np.abs(x); y=np.where(a<T14/2-Tin,1,np.where(a<T14/2,(T14/2-a)/max(Tin,1e-3),0)); return c-d*y
s=least_squares(lambda p:trap(p,x[m])-D[m],[0.06,6,2,0],bounds=([0,1,0.05,-0.1],[0.5,20,10,0.1]))
J=s.jac; cov=np.linalg.pinv(J.T@J)*np.mean(s.fun**2); pe=np.sqrt(np.diag(cov))
# timing error via bootstrap on epochs: per-epoch fitted times
ep=[]
for k in range(-150,150):
    tc=T0+k*P; mm=np.abs(T-tc)<0.6
    if mm.sum()<20 or (np.abs(T-tc)<0.1).sum()<5: continue
    tt=T[mm]; dd=D[mm]
    sc=[(-np.mean(dd[np.abs(tt-(tc+o))<s.x[1]/48]),o) for o in np.arange(-0.15,0.15,0.005) if (np.abs(tt-(tc+o))<s.x[1]/48).sum()>3]
    dep=-np.mean(dd[np.abs(tt-tc)<s.x[1]/48]); err=1.4826*np.median(np.abs(D-np.median(D)))/np.sqrt((np.abs(tt-tc)<s.x[1]/48).sum())
    ep.append(dict(k=k,t=round(tc,3),sector=int(Sx[mm][0]),depth_ppt=round(dep*1e3,1),err=round(err*1e3,1),best_offset_h=round(max(sc)[1]*24,1) if sc else None))
odd=[e for e in ep if e['k']%2]; even=[e for e in ep if not e['k']%2]
wm=lambda L:(float(np.sum([e['depth_ppt']/e['err']**2 for e in L])/np.sum([1/e['err']**2 for e in L])),float(1/np.sqrt(np.sum([1/e['err']**2 for e in L]))))
# secondary scan
phs=np.arange(0.02,0.98,0.002); sec=[]
for p0 in phs:
    q=np.abs(((T-T0)/P-p0+0.5)%1-0.5)*P<s.x[1]/48; sec.append(-np.mean(D[q]) if q.sum()>10 else np.nan)
sec=np.array(sec); sig=np.nanstd(sec)
ib=int(np.nanargmax(sec))
out=dict(P=P,T0=T0,trapezoid=dict(depth_ppt=s.x[0]*1e3,depth_err=pe[0]*1e3,T14_h=s.x[1],T14_err=pe[1],Tingress_h=s.x[2],Tin_err=pe[2]),
         n_epochs=len(ep),odd=wm(odd),even=wm(even),epochs=ep,
         secondary=dict(best_phase=float(phs[ib]),depth_ppt=float(sec[ib]*1e3),scan_std_ppt=float(sig*1e3),snr=float(sec[ib]/sig),
                        depth_at_0p5_ppt=float(sec[np.argmin(np.abs(phs-0.5))]*1e3)))
# also test 2P (37.3 d): is the alternate set different (odd/even above) ; epochs per sector
print(json.dumps({k:v for k,v in out.items() if k!='epochs'},indent=1)); print([(e['t'],e['sector'],e['depth_ppt'],e['err'],e['best_offset_h']) for e in ep])
json.dump(out,open("data/step5_period.json","w"),indent=1)
fig,ax=plt.subplots(1,2,figsize=(14,4.5))
ax[0].plot(x[m],D[m]*1e3,'.',ms=2,color='0.6'); xb=np.arange(-14,14,0.5); ax[0].plot(xb,[np.mean(D[m][np.abs(x[m]-c)<0.25])*1e3 for c in xb],'k.-'); xx=np.linspace(-14,14,500); ax[0].plot(xx,trap(s.x,xx)*1e3,'r')
ax[0].set_xlabel('h from mid-eclipse'); ax[0].set_ylabel('ppt (QLP SAP, EB-masked, detrended)'); ax[0].set_title(f'all QLP epochs folded, P={P:.4f} d'); ax[0].set_ylim(-150,60)
ax[1].plot(phs,sec*1e3,'k-'); ax[1].axhline(3*sig*1e3,color='r',ls='--'); ax[1].set_xlabel('phase'); ax[1].set_ylabel(f'{s.x[1]:.1f} h box depth ppt'); ax[1].set_title('secondary-eclipse scan')
fig.tight_layout(); fig.savefig('figs/step5_period.png',dpi=90)
