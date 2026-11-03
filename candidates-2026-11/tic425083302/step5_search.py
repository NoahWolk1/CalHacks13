"""All-sector QLP SAP search (S27-93; S96-98 excluded for their background error) after removing a 1.5-d running median and masking
the 4.467-d EB's eclipses (+-0.3 d). A 4 h box slid every 0.01 d; independent extrema of both signs; repeats of the event; allowed periods.
Also year 1 (ELEANOR-lite CORR_FLUX, S1-13, 30-min) for repeats."""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, json
from scipy.ndimage import median_filter
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
from lcio import load_all
from common import TC, DUR
eb=json.load(open("data/step5_eb.json")); P,T0,psec=eb['P'],eb['T0_btjd'],eb['secondary_phase']
def ebmask(t):
    ph=((t-T0)/P)%1; d1=np.minimum(ph,1-ph)*P; d2=np.abs(ph-psec)*P; return (d1<0.3)|(d2<0.3)
S=[]
for r in load_all(["QLP","ELEANOR"]):
    if r['author']=='QLP' and r['sector']>=96: continue
    col='SAP_FLUX' if r['author']=='QLP' else 'ELE_CORR'
    t=r['t']; f=r[col]; g=(r['q']==0)&np.isfinite(f)&np.isfinite(t)&(f>0)
    t=t[g]; f=f[g]/np.nanmedian(f[g]); m=~ebmask(t)
    t=t[m]; f=f[m]
    dt=np.median(np.diff(t)); n=int(round(1.5/dt))|1
    d=f/median_filter(f,size=n,mode='nearest')-1
    mad=1.4826*np.median(np.abs(d)); k=np.abs(d)<6*mad
    S.append((r['author'],int(r['sector']),t[k],d[k]))
rows=[]
for a,s,t,d in S:
    dt=np.median(np.diff(t)); grid=np.arange(t.min()+DUR/2,t.max()-DUR/2,0.01)
    i0=np.searchsorted(t,grid-DUR/2); i1=np.searchsorted(t,grid+DUR/2); cs=np.concatenate([[0],np.cumsum(d)]); n=i1-i0
    okc=n>=0.7*DUR/dt; dep=np.where(okc,-(cs[i1]-cs[i0])/np.maximum(n,1),np.nan)
    sig=1.4826*np.nanmedian(np.abs(dep-np.nanmedian(dep)))
    for gg,x in zip(grid[okc],dep[okc]): rows.append((a,s,gg,x,sig))
R=np.array([(r[1],r[2],r[3],r[4],0 if r[0]=='QLP' else 1) for r in rows])
def extrema(R,sign):
    snr=sign*R[:,2]/R[:,3]; o=np.argsort(-snr); used=[]; pk=[]
    for i in o:
        if snr[i]<3: break
        if any(abs(R[i,1]-u)<0.5 for u in used): continue
        used.append(R[i,1]); pk.append(dict(sector=int(R[i,0]),t=round(float(R[i,1]),3),depth_ppt=round(float(R[i,2])*1e3,1),snr=round(float(snr[i]),1),pipe='QLP' if R[i,4]==0 else 'ELEANOR'))
    return pk
dips=extrema(R,1); bri=extrema(R,-1)
evd=[x for x in dips if abs(x['t']-TC)<0.3]
out=dict(event=evd, top_dips=dips[:12], top_brightenings=bri[:8], days=float(sum(t.max()-t.min() for a,s,t,d in S)))
e=evd[0] if evd else None
if e:
    out['n_dips_ge_event_snr']=sum(x['snr']>=e['snr'] for x in dips); out['n_bright_ge_event_snr']=sum(x['snr']>=e['snr'] for x in bri)
    half=e['snr']/2; out['n_dips_ge_half_event_snr']=sum(x['snr']>=half for x in dips); out['n_bright_ge_half_event_snr']=sum(x['snr']>=half for x in bri)
    out['n_dips_ge_half_depth']=sum(x['depth_ppt']>=e['depth_ppt']/2 for x in dips if x['pipe']=='QLP'); out['n_bright_ge_half_depth']=sum(-x['depth_ppt']>=e['depth_ppt']/2 for x in bri if x['pipe']=='QLP')
# exclusion: where a box of the event's depth would have been seen at >=3 sigma (QLP only, same dilution assumed)
DEP=e['depth_ppt']*1e-3 if e else 0.1
RES=0.01; gt=np.arange(1300,3900,RES); cov=np.zeros(len(gt),bool); ex=np.zeros(len(gt),bool)
for a,s,t,d in S:
    dt=np.median(np.diff(t)); i0=np.searchsorted(t,gt-DUR/2); i1=np.searchsorted(t,gt+DUR/2); n=i1-i0; okc=n>=0.5*DUR/dt
    cs=np.concatenate([[0],np.cumsum(d)]); dep=np.where(okc,-(cs[i1]-cs[i0])/np.maximum(n,1),np.nan)
    sig=1.4826*np.nanmedian(np.abs(dep[okc]-np.nanmedian(dep[okc]))) if okc.any() else 1
    scale=1.0 if a=='QLP' else 0.5   # ELEANOR year-1 aperture assumed to dilute it 2x more (conservative)
    cov|=okc; ex|=okc&(DEP*scale-3*sig>0.5*DEP*scale) if False else okc&(dep<DEP*scale-3*sig)
# a dip of the event depth would be detected where the measured box is < DEP-3sig is "not seen" -> exclusion uses "measured depth inconsistent with DEP"
Pg=np.exp(np.arange(np.log(1.0),np.log(2000),2e-5)); allowed=np.ones(len(Pg),bool)
for k in range(-2000,2000):
    if k==0: continue
    tk=TC+k*Pg; mm=(tk>1300)&(tk<3900-RES)
    if not mm.any(): continue
    idx=((tk[mm]-1300)/RES).round().astype(int); allowed[np.where(mm)[0][ex[idx]]]=False
out['allowed_period_fraction']={f"{lo}-{hi} d":float(allowed[(Pg>=lo)&(Pg<hi)].mean()) for lo,hi in [(1,5),(5,30),(30,100),(100,300),(300,1000),(1000,2000)]}
out['shortest_allowed_P']=float(Pg[allowed].min())
out['excluded_fraction_of_covered_time']=float(ex.sum()/cov.sum())
print(json.dumps(out,indent=1)); json.dump(out,open("data/step5_search.json","w"),indent=1)
fig,ax=plt.subplots(figsize=(13,4))
for a,s,t,d in S:
    nb=max(int(round((1/12)/np.median(np.diff(t)))),1); n=len(t)//nb
    ax.plot(t[:n*nb].reshape(n,nb).mean(1),d[:n*nb].reshape(n,nb).mean(1)*1e3,'.',ms=1,color='C0' if a=='QLP' else 'C2')
ax.axvline(TC,color='r',lw=.6); ax.set_ylim(-120,80); ax.set_xlabel('BTJD'); ax.set_ylabel('ppt (2 h bins)'); ax.set_title('EB-masked, detrended: QLP (blue), ELEANOR-lite year 1 (green); red = event')
plt.tight_layout(); plt.savefig('figs/step5_search.png',dpi=100)
