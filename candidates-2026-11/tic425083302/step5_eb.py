"""Ephemeris of the 4.467-d eclipsing binary OGLE-LMC-ECL-51276 (9.8 arcsec from the target) from QLP SAP S27-93:
per-sector detrend (2-d running median with +-0.4 d around each predicted eclipse masked), then a fine grid in P, T0 maximising the
folded primary depth; secondary phase and widths; finally lists every EB eclipse near the event and the vet's other epochs."""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, json
from scipy.ndimage import median_filter
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
from lcio import load_all
from common import TC, DUR
T=[];F=[];S=[]
for r in load_all(["QLP"]):
    if r['sector']>=96: continue      # S96-98 QLP is dominated by a 27000 e/s background error
    t=r['t']; f=r['SAP_FLUX']; g=(r['q']==0)&np.isfinite(f)
    t=t[g]; f=f[g]/np.nanmedian(f[g])
    dt=np.median(np.diff(t)); n=int(round(1.5/dt))|1
    tr=median_filter(f,size=n,mode='nearest'); T.append(t); F.append(f/tr-1); S.append(np.full(len(t),r['sector']))
T=np.concatenate(T);F=np.concatenate(F);S=np.concatenate(S)
ev=np.abs(T-TC)<0.3
def fold_depth(P,T0,w=0.06):
    ph=((T-T0)/P+0.5)%1-0.5
    return -np.mean(F[(np.abs(ph*P)<w)&~ev])
P0=4.4668736
best=(0,None)
for P in np.arange(P0-0.0006,P0+0.0006,0.00001):
    for T0 in np.arange(2132.55,2133.05,0.005):
        d=fold_depth(P,T0)
        if d>best[0]: best=(d,(P,T0))
d,(P,T0)=best
# refine
for P in np.arange(P-0.00002,P+0.00002,0.000001):
    for T0_ in np.arange(T0-0.01,T0+0.01,0.0005):
        dd=fold_depth(P,T0_)
        if dd>d: d,best_=dd,(P,T0_)
try: P,T0=best_
except NameError: pass
ph=((T-T0)/P)%1
# secondary: scan phase
phs=np.arange(0.05,0.95,0.002); sec=[-np.mean(F[(np.abs(ph-p)<0.06/P)&~ev]) for p in phs]; psec=phs[int(np.argmax(sec))]
# binned profile
pb=np.arange(-0.5,0.5,0.004); prof=[np.median(F[(np.abs(((ph+0.5)%1-0.5)-p)<0.002)&~ev]) for p in pb]
def width(center):
    x=((ph-center+0.5)%1-0.5)*P*24; y=F; m=(np.abs(x)<12)&~ev
    xb=np.arange(-12,12,0.5); yb=np.array([np.median(y[m&(np.abs(x-c)<0.25)]) for c in xb])
    dep=-yb.min(); half=xb[yb<-dep/2]
    return float(dep), float(half.max()-half.min()+0.5) if len(half) else None, xb, yb
dp,wp,xb,ybp=width(0); ds,ws,_,ybs=width(psec)
out=dict(P=P,T0_btjd=T0,primary_depth_ppt=dp*1e3,primary_FWHM_h=wp,secondary_phase=float(psec),secondary_depth_ppt=ds*1e3,secondary_FWHM_h=ws,
         OGLE=dict(P=4.4668736,T0_btjd=2460003.5856-2457000))
# esinw/ecosw from secondary phase and widths
out['e_cos_w_approx']=float(np.pi/2*(psec-0.5)); out['e_sin_w_approx']=float((ws-wp)/(ws+wp)) if (ws and wp) else None
# OGLE vs TESS offset at TC
out['OGLE_minus_TESS_primary_at_TC_d']=float(((2460003.5856-2457000-T0)/P+0.5)%1*P-0.5*P)
def near(t0,lab):
    n=np.round((t0-T0)/P); dpri=t0-(T0+n*P); ns=np.round((t0-T0-psec*P)/P); dsec=t0-(T0+psec*P+ns*P)
    return dict(epoch=lab,t=t0,phase=float(((t0-T0)/P)%1),d_from_primary_h=float(dpri*24),d_from_secondary_h=float(dsec*24))
out['epochs']=[near(TC,'event'),near(3736.06,'vet secondary'),near(4010.73,'vet brightening')]
print(json.dumps(out,indent=1)); json.dump(out,open('data/step5_eb.json','w'),indent=1)
fig,ax=plt.subplots(1,2,figsize=(14,4.5))
ax[0].plot(((ph+0.25)%1-0.25),F*1e3,',',color='0.6'); ax[0].plot(pb[pb>-0.25],np.array(prof)[pb>-0.25]*1e3,'r-'); ax[0].plot(((pb+0.5)%1-0.5+1)[pb<-0.25]-1+1,np.array(prof)[pb<-0.25]*1e3,'r-')
ax[0].axvline(out['epochs'][0]['phase'] if out['epochs'][0]['phase']<0.75 else out['epochs'][0]['phase']-1,color='orange',label='event phase')
ax[0].set_ylim(-120,50); ax[0].set_xlabel(f'phase (P={P:.6f} d, T0={T0:.4f})'); ax[0].set_ylabel('QLP SAP, detrended, ppt'); ax[0].legend()
ax[0].set_title('QLP S27-93 folded on the EB ephemeris')
ax[1].plot(xb,ybp*1e3,'k.-',label='EB primary'); ax[1].plot(xb,ybs*1e3,'b.-',label='EB secondary')
m=np.abs(T-TC)<0.5; ax[1].plot((T[m]-TC)*24,F[m]*1e3,'o',color='orange',ms=3,label='event (S30)')
ax[1].set_xlabel('hours from minimum'); ax[1].legend(); ax[1].set_title('eclipse profiles vs the event (same detrending)')
fig.tight_layout(); fig.savefig('figs/step5_eb.png',dpi=90)
