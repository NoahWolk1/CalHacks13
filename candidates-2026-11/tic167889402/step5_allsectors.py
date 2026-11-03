"""All SPOC 2-min sectors: prewhiten the pulsations per contiguous sector group (40 frequencies,
30-min bins), then slide an 8 h box (local quadratic per segment, +-1 d) over every sector.
Counts how often dips AND brightenings as large as the S96 event occur; measures the
automated vet's 'repeat' epochs; computes allowed periods."""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, json, sys
from astropy.timeseries import LombScargle
from lcio import load_all
from measure import trapezoid, segments
from common import TC, DUR
COL=sys.argv[1] if len(sys.argv)>1 else "SAP_FLUX"
GROUPS=[[1,2,3,4,5],[7,8,9,10,11,12,13],[27,28,29,30,31,32,33,34,35],[37,38,39],[61,62,63,64,65,66,67,68,69],[87,88,89,90],[93,94,95,96,97]]
NF=40
lcs={r['sector']:r for r in load_all() if r['author']=='SPOC'}
TB=[];RB=[];SB=[];YB=[]
for G in GROUPS:
    T=[];F=[];S=[]
    for sec in G:
        if sec not in lcs: continue
        r=lcs[sec]; g=(r['q']==0)&np.isfinite(r[COL])&np.isfinite(r['t'])
        t=r['t'][g]; f=r[COL][g]/np.nanmedian(r[COL][g])-1
        e=np.arange(t.min(),t.max()+1/48,1/48); i=np.digitize(t,e); u,cnt=np.unique(i,return_counts=True); u=u[cnt>=8]
        T.append(np.array([t[i==k].mean() for k in u])); F.append(np.array([f[i==k].mean() for k in u])); S.append(np.full(len(u),sec))
    t=np.concatenate(T); f=np.concatenate(F); s=np.concatenate(S)
    def design(freqs):
        cols=[]
        for sec in G:
            m=(s==sec).astype(float)
            if m.sum()==0: continue
            tm=t[s==sec].mean(); cols+=[m,m*(t-tm)]
        for nu in freqs: cols+=[np.sin(2*np.pi*nu*t),np.cos(2*np.pi*nu*t)]
        return np.vstack(cols).T
    freqs=[]
    for k in range(NF):
        A=design(freqs); c,*_=np.linalg.lstsq(A,f,rcond=None); res=f-A@c
        fr,pw=LombScargle(t,res).autopower(minimum_frequency=0.05,maximum_frequency=5,samples_per_peak=10)
        freqs.append(fr[np.argmax(pw)])
    A=design(freqs); c,*_=np.linalg.lstsq(A,f,rcond=None); res=f-A@c
    print(f"group S{G[0]}-{G[-1]}: {len(t)} bins, resid rms {np.std(res)*1e3:.3f} ppt, top freq {freqs[0]:.4f} c/d", flush=True)
    TB.append(t);RB.append(res);SB.append(s)
t=np.concatenate(TB); r=np.concatenate(RB); s=np.concatenate(SB)
np.save(f"data/step5_resid_{COL}.npy",np.vstack([t,r,s]))
def boxfit(tc,win=1.0):
    w=np.abs(t-tc)<win; tt=t[w]; yy=r[w]
    if len(tt)<20: return np.nan,np.nan
    box=trapezoid(tt,tc,DUR)
    if (box>0.5).sum()<0.8*DUR*48 or (box<0.01).sum()<30: return np.nan,np.nan
    cols=[-box]
    for idx in segments(tt):
        if len(idx)<6: continue
        c=np.zeros(len(tt)); c[idx]=1; x=tt-tc; span=tt[idx].ptp() if hasattr(tt[idx],'ptp') else np.ptp(tt[idx])
        o=2 if span>0.8 else (1 if span>0.3 else 0)
        if (box[idx]<0.01).sum()<5: continue
        for k in range(o+1): cols.append(c*x**k)
    A=np.vstack(cols).T; c,*_=np.linalg.lstsq(A,yy,rcond=None); res=yy-A@c
    se=np.sqrt(np.linalg.pinv(A.T@A)[0,0])*np.std(res)
    return c[0]*1e3, se*1e3
grid=np.arange(t.min(),t.max(),0.05)
D=np.array([boxfit(g) for g in grid]); ok=np.isfinite(D[:,0]); gd=grid[ok]; D=D[ok]
d0,s0=boxfit(TC)
sig=1.4826*np.median(np.abs(D[:,0]-np.median(D[:,0])))
# independent events: local extrema separated by > DUR
def events(sign,thr):
    v=sign*D[:,0]; idx=np.where(v>=thr)[0]; evs=[]
    for i in idx:
        if evs and gd[i]-gd[evs[-1]]<0.5:
            if v[i]>v[evs[-1]]: evs[-1]=i
        else: evs.append(i)
    return [(round(float(gd[i]),2),round(float(D[i,0]),3),int(s[np.argmin(np.abs(t-gd[i]))])) for i in evs]
dips=events(1,0.647); brs=events(-1,0.647)
span=len(np.unique(np.round(gd/0.333)))  # number of independent box positions
print(f"\n{COL}: event at TC {d0:.3f} +- {s0:.3f} (white) ppt; slid-box robust sigma {sig:.3f} ppt over {len(gd)} positions (~{span} independent 8 h boxes)")
print(f" dips >= 0.647 ppt: {len(dips)} independent; brightenings >= 0.647 ppt: {len(brs)}")
print(" fraction of positions with depth >= event:", np.mean(D[:,0]>=d0), " brightening >= event:", np.mean(-D[:,0]>=d0))
print(" largest dips:", sorted(dips,key=lambda x:-x[1])[:10]); print(" largest brightenings:", sorted(brs,key=lambda x:x[1])[:10])
vet=[3069.25,3073.75,3079.58,3094.66,3122.26,3140.90,3701.52,3706.68,3746.57]
vr={}
for v in vet:
    dv,sv=boxfit(v); vr[v]=(dv,sv); print(f" vet epoch {v}: {dv:.3f} +- {sv:.3f} ppt (white), {dv/sig:.1f} sigma_emp")
# per-sector 3-sigma limits
lim={}
for sec in np.unique(s):
    m=np.array([s[np.argmin(np.abs(t-g))]==sec for g in gd])
    if m.sum()>20: lim[int(sec)]=float(3*1.4826*np.median(np.abs(D[m,0]-np.median(D[m,0]))))
print(" per-sector 3-sigma 8 h limits (ppt):", {k:round(v,2) for k,v in lim.items()})
json.dump(dict(col=COL,depth_tc=d0,sig_white_tc=s0,sigma_emp=sig,n_positions=len(gd),dips=dips,brightenings=brs,vet_epochs={str(k):v for k,v in vr.items()},limits_3sig=lim,
               frac_deeper=float(np.mean(D[:,0]>=d0)),frac_bright=float(np.mean(-D[:,0]>=d0))),open(f"data/step5_allsectors_{COL}.json","w"),indent=1)
np.save(f"data/step5_slide_{COL}.npy",np.vstack([gd,D.T]))
