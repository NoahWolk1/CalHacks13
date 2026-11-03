"""Test the BLS families (18.66 / 37.32 / 55.98 d) that include the event: per-epoch 4 h box depths (EB-masked, detrended QLP SAP, same as
step5_search), folded plots, and the depth at phase 0.5. Also the box-depth distribution at random epochs for comparison."""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, json
from scipy.ndimage import median_filter
from scipy.optimize import minimize_scalar
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
from lcio import load_all
from common import TC, DUR
eb=json.load(open("data/step5_eb.json")); P,T0,psec=eb['P'],eb['T0_btjd'],eb['secondary_phase']
T=[];D=[];Sx=[]
for r in load_all(["QLP"]):
    if r['sector']>=96: continue
    t=r['t']; f=r['SAP_FLUX']; g=(r['q']==0)&np.isfinite(f); t=t[g]; f=f[g]/np.nanmedian(f[g])
    ph=((t-T0)/P)%1; m=~((np.minimum(ph,1-ph)*P<0.3)|(np.abs(ph-psec)*P<0.3)); t=t[m]; f=f[m]
    dt=np.median(np.diff(t)); n=int(round(1.5/dt))|1; d=f/median_filter(f,size=n,mode='nearest')-1
    T.append(t); D.append(d); Sx.append(np.full(len(t),r['sector']))
T=np.concatenate(T); D=np.concatenate(D); Sx=np.concatenate(Sx)
def box(tc,w=DUR):
    m=np.abs(T-tc)<w/2
    if m.sum()<5: return None
    return float(-np.mean(D[m])), float(1.4826*np.median(np.abs(D-np.median(D)))/np.sqrt(m.sum())), int(m.sum())
rng=np.random.default_rng(0); rnd=[box(x) for x in rng.uniform(T.min(),T.max(),4000)]; rnd=np.array([x[0] for x in rnd if x])
out=dict(random_box_depth_ppt=dict(median=float(np.median(rnd)*1e3),std=float(np.std(rnd)*1e3),p99=float(np.percentile(rnd,99)*1e3),p1=float(np.percentile(rnd,1)*1e3)))
fig,ax=plt.subplots(1,3,figsize=(16,4.5))
for a,Pf in zip(ax,[18.6604,37.3202,55.9797]):
    # refine epoch around TC
    ep=[]
    for k in range(-200,200):
        tc=TC+k*Pf; b=box(tc)
        if b: ep.append(dict(k=k,t=round(tc,3),depth_ppt=round(b[0]*1e3,1),err_ppt=round(b[1]*1e3,1),n=b[2],sector=int(Sx[np.argmin(np.abs(T-tc))])))
        b2=box(tc+Pf/2)
    dd=np.array([e['depth_ppt'] for e in ep]); ee=np.array([e['err_ppt'] for e in ep])
    others=[e for e in ep if e['k']!=0]
    od=np.array([e['depth_ppt'] for e in others]); oe=np.array([e['err_ppt'] for e in others])
    wm=float(np.sum(od/oe**2)/np.sum(1/oe**2)) if len(od) else None; we=float(1/np.sqrt(np.sum(1/oe**2))) if len(od) else None
    sec=[box(TC+(k+0.5)*Pf) for k in range(-200,200)]; sec=np.array([s[0] for s in sec if s])*1e3
    out[f"P{Pf}"]=dict(n_epochs=len(ep),epochs=ep,other_epochs_weighted_mean_ppt=wm,err=we,n_other_ge_30ppt=int((od>=30).sum()),n_other=len(od),
                       phase05_mean_ppt=float(np.mean(sec)) if len(sec) else None, frac_random_ge_30ppt=float((rnd*1e3>=30).mean()))
    ph=((T-TC)/Pf+0.5)%1-0.5; mm=np.abs(ph*Pf)<1
    a.plot(ph[mm]*Pf*24,D[mm]*1e3,'.',ms=2,color='0.5'); mk=np.abs(T-TC)<1; a.plot((T[mk]-TC)*24,D[mk]*1e3,'r.',ms=3,label='event (S30)')
    xb=np.arange(-24,24,1); yb=[np.mean(D[mm&~mk][np.abs(ph[mm&~mk]*Pf*24-x)<0.5])*1e3 for x in xb]; a.plot(xb,yb,'b-',label='other epochs, 1 h bins')
    a.set_ylim(-150,80); a.set_title(f'P = {Pf} d: {len(od)} other epochs, mean {wm:.1f}±{we:.1f} ppt'); a.set_xlabel('h from event'); a.legend(fontsize=7)
print(json.dumps({k:(v if not isinstance(v,dict) or 'epochs' not in v else {kk:vv for kk,vv in v.items() if kk!='epochs'}) for k,v in out.items()},indent=1))
for Pf in ['P18.6604','P37.3202']:
    print(Pf,[(e['t'],e['sector'],e['depth_ppt'],e['err_ppt']) for e in out[Pf]['epochs']])
json.dump(out,open("data/step5_fold.json","w"),indent=1)
fig.tight_layout(); fig.savefig('figs/step5_fold.png',dpi=90)
