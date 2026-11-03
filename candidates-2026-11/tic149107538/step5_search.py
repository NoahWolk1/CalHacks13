"""All-sector single-event statistics for an 8 h box on the TESS-SPOC (S61-69) and SPOC (S96) SAP flux.
Estimators (each fitted jointly with the trapezoid):
  H : per-orbit harmonic model of P_rot=6.104 d (3 harmonics, amplitudes linear in time) + quadratic
  L4: local quartic over +-1.5 d
  RM: vet-like running median (1.33 d) detrend, then box depth vs local zero
For every estimator: rank of the event among all positions (step 0.05 d), dips vs brightenings of the same size,
and the rotational phase/curvature at each of the deepest dips. Also injection-recovery of a 1.9 ppt 8 h dip at TC."""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, json
from scipy.ndimage import median_filter
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
from lcio import load_all
from measure import trapezoid
from common import TC, DUR
P=6.104
def bin10(t,y,dt=10/1440):
    b=np.floor((t-t.min())/dt).astype(int); n=np.bincount(b); ok=n>0
    return (np.bincount(b,t)[ok]/n[ok]), (np.bincount(b,y)[ok]/n[ok])
data=[]
for r in load_all(authors=["TESS-SPOC","SPOC"]):
    t=r['t']; f=r['SAP_FLUX']; g=(r['q']==0)&np.isfinite(f)&np.isfinite(t)
    t,y=bin10(t[g],f[g]/np.nanmedian(f[g])-1)
    br=np.where(np.diff(t)>0.5)[0]+1
    for idx in np.split(np.arange(len(t)),br):
        if len(idx)>100: data.append(dict(sector=int(r['sector']),t=t[idx],y=y[idx]))
def harm_cols(t):
    tm=t.mean(); x=(t-tm)/(t.max()-t.min()); cols=[x**k for k in range(3)]
    for h in range(1,4):
        for a in (np.sin,np.cos):
            b=a(2*np.pi*h*(t-tm)/P); cols+=[b,b*x]
    return cols
def fitdepth(t,y,cols,tc):
    s=trapezoid(t,tc,DUR); A=np.vstack([-s]+cols).T; c,*_=np.linalg.lstsq(A,y,rcond=None); return c[0], A[:,1:]@c[1:]
rows=[]
for seg in data:
    t,y=seg['t'],seg['y']; HC=harm_cols(t)
    rm=median_filter(y,size=int(1.33/(10/1440))|1,mode='nearest'); yd=y-rm
    smooth=median_filter(y,size=int(0.5/(10/1440))|1,mode='nearest')
    for tc in np.arange(t.min()+DUR,t.max()-DUR,0.05):
        inb=np.abs(t-tc)<DUR/2
        if inb.sum()<0.7*DUR/(10/1440): continue
        dH,_=fitdepth(t,y,HC,tc)
        w=np.abs(t-tc)<1.5
        if w.sum()>200 and (t[w].min()<tc-1.0) and (t[w].max()>tc+1.0):
            x=(t[w]-tc)/1.5; dL,_=fitdepth(t[w],y[w],[x**k for k in range(5)],tc)
        else: dL=np.nan
        dR=-np.mean(yd[inb])
        # local curvature of the smoothed light curve (ppt/d^2) and level relative to segment range
        ww=np.abs(t-tc)<1.0; cc=np.polyfit(t[ww]-tc,smooth[ww],2)[0]*2e3 if ww.sum()>20 else np.nan
        rows.append((seg['sector'],tc,dH,dL,dR,cc))
R=np.array(rows)
def indep(col,sign=1,sep=0.5):
    v=sign*R[:,col]; ok=np.isfinite(v); o=np.argsort(-np.where(ok,v,-np.inf)); picked=[]
    for i in o:
        if not ok[i]: break
        if all(abs(R[i,1]-R[j,1])>sep for j in picked): picked.append(i)
    return picked
out={}
ev=np.argmin(np.abs(R[:,1]-TC))
for name,col in [("harmonic",2),("local_quartic",3),("running_median_1.33d",4)]:
    pd=indep(col,1); pb=indep(col,-1)
    vals=R[pd,col]; rank=[k for k,i in enumerate(pd) if abs(R[i,1]-TC)<0.3]
    d_ev=R[ev,col]
    nd=int(np.sum(R[pd,col]>=d_ev)); nb=int(np.sum(-R[pb,col]>=d_ev))
    top=[dict(sector=int(R[i,0]),t=round(R[i,1],2),depth_ppt=round(R[i,col]*1e3,2),curv=round(R[i,5],1)) for i in pd[:12]]
    topb=[dict(sector=int(R[i,0]),t=round(R[i,1],2),bright_ppt=round(-R[i,col]*1e3,2),curv=round(R[i,5],1)) for i in pb[:6]]
    # correlation of depth with curvature over all positions
    ok=np.isfinite(R[:,col])&np.isfinite(R[:,5]); rc=np.corrcoef(R[ok,col],R[ok,5])[0,1]
    out[name]=dict(event_depth_ppt=round(d_ev*1e3,3),event_rank=(rank[0]+1 if rank else None),n_indep=len(pd),
                   n_dips_ge_event=nd,n_brightenings_ge_event=nb,robust_sigma_ppt=round(1.4826*np.nanmedian(np.abs(R[:,col]-np.nanmedian(R[:,col])))*1e3,3),
                   corr_depth_vs_curvature=round(float(rc),3),top_dips=top,top_brightenings=topb)
    print(name,json.dumps({k:v for k,v in out[name].items()},default=str)[:1500])
out["event_curvature_ppt_per_d2"]=round(R[ev,5],1)
out["curvature_percentile_of_event"]=round(float((R[:,5]<R[ev,5]).mean()),3)
# injection at TC in the harmonic estimator
seg=[s for s in data if s['t'].min()<TC<s['t'].max()][0]
t,y=seg['t'],seg['y']; HC=harm_cols(t)
d0,_=fitdepth(t,y,HC,TC); d1,_=fitdepth(t,y-1.91e-3*trapezoid(t,TC,DUR),HC,TC)
x=(t-TC)/1.5; w=np.abs(t-TC)<1.5
out["injection_1.91ppt_at_TC"]=dict(harmonic_recovered_ppt=round((d1-d0)*1e3,3))
print("event curvature",out["event_curvature_ppt_per_d2"],"pct",out["curvature_percentile_of_event"],out["injection_1.91ppt_at_TC"])
json.dump(out,open("data/step5_search.json","w"),indent=1,default=float)
np.save("data/step5_rows.npy",R)
fig,ax=plt.subplots(1,3,figsize=(15,4))
for a,(name,col) in zip(ax,[("harmonic",2),("local quartic",3),("running median 1.33 d",4)]):
    a.scatter(R[:,5],R[:,col]*1e3,s=1,c='0.5'); a.scatter([R[ev,5]],[R[ev,col]*1e3],c='r',s=30); a.set_xlabel('local curvature of light curve [ppt/d$^2$]'); a.set_ylabel('8 h depth [ppt]'); a.set_title(name)
fig.tight_layout(); fig.savefig("figs/step5_depth_vs_curvature.png",dpi=90)
