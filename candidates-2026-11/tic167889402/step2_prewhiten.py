"""Prewhiten the gamma-Dor-like pulsations over a contiguous run of sectors, then measure the
box depth at TC in the residuals and its noise distribution (box slid over all residual data)."""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, json, sys
from astropy.timeseries import LombScargle
from lcio import load_all
from measure import measure
from common import TC, DUR
COL=sys.argv[1] if len(sys.argv)>1 else "PDCSAP_FLUX"
SECS=[93,94,95,96,97]; NF=int(sys.argv[2]) if len(sys.argv)>2 else 40
T=[];F=[];S=[]
for r in load_all():
    if r['author']!='SPOC' or r['sector'] not in SECS: continue
    g=(r['q']==0)&np.isfinite(r[COL])
    t=r['t'][g]; f=r[COL][g]/np.nanmedian(r[COL][g])-1
    # per-orbit-segment linear trend removal (SAP drifts), long timescale only
    T.append(t);F.append(f);S.append(np.full(len(t),r['sector']))
t=np.concatenate(T);f=np.concatenate(F);s=np.concatenate(S)
# 30-min bins to speed up
e=np.arange(t.min(),t.max()+0.0209,1/48.); i=np.digitize(t,e)
u=np.unique(i); tb=np.array([t[i==k].mean() for k in u]); fb=np.array([f[i==k].mean() for k in u]); sb=np.array([s[i==k][0] for k in u])
def design(tt,ss,freqs):
    cols=[]
    for sec in SECS:  # per-sector offset + slope
        m=(ss==sec).astype(float); 
        if m.sum()==0: continue
        tm=tt[ss==sec].mean(); cols+= [m, m*(tt-tm)]
    for nu in freqs: cols+=[np.sin(2*np.pi*nu*tt),np.cos(2*np.pi*nu*tt)]
    return np.vstack(cols).T
mask=np.abs(tb-TC)>0.4  # mask the event when fitting the pulsations
freqs=[]; res=fb.copy()
for k in range(NF):
    A=design(tb[mask],sb[mask],freqs); c,*_=np.linalg.lstsq(A,fb[mask],rcond=None)
    res=fb[mask]-A@c
    fr,pw=LombScargle(tb[mask],res).autopower(minimum_frequency=0.05,maximum_frequency=5,samples_per_peak=20)
    freqs.append(fr[np.argmax(pw)])
A=design(tb[mask],sb[mask],freqs); c,*_=np.linalg.lstsq(A,fb[mask],rcond=None)
amps=[np.hypot(c[-2*len(freqs)+2*j],c[-2*len(freqs)+2*j+1])*1e3 for j in range(len(freqs))]
print("freqs (c/d) & amp (ppt):", [(round(a,4),round(b,2)) for a,b in zip(freqs,amps)][:15])
model_full=design(t,s,freqs)@c
resid=f-model_full
print("resid rms 2-min %.3f ppt; 30-min-binned-model resid rms %.3f ppt"%(np.std(resid)*1e3, np.std(fb[mask]-A@c)*1e3))
out={}
for sec in SECS:
    m=s==sec
    for dur in [0.25,DUR,0.5]:
        if sec!=96 and dur!=DUR: continue
        tc=TC if sec==96 else None
        if tc is None: continue
        for win in [0.75,1.0,1.5]:
            r=measure(t[m],1+resid[m],tc,dur,win=win,order=1)
            print(f"S{sec} dur {dur*24:.0f}h win {win}: depth {r['depth']*1e3:.3f} +- {r['sig_adopt']*1e3:.3f} ppt (white {r['sig_white']*1e3:.3f} beta {r['beta']:.2f} emp {r['sig_emp']*1e3:.3f}) frac_deeper {r['frac_deeper']:.3f}")
            out[f"{dur*24:.0f}h_win{win}"]=dict(depth=r['depth']*1e3,sig=r['sig_adopt']*1e3,frac_deeper=r['frac_deeper'],emp=r['sig_emp']*1e3)
np.save(f"data/prewhiten_resid_{COL}.npy",np.vstack([t,resid,s,model_full]))
json.dump(dict(col=COL,nf=NF,freqs=list(map(float,freqs)),amps=list(map(float,amps)),depths=out),open(f"data/step2_prewhiten_{COL}_{NF}.json","w"),indent=1)
