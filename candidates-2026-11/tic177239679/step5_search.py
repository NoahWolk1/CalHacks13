"""All sectors: remove the per-sector harmonic model (2.374 d x3, 4.42 d x2, per-orbit quadratic), then an 8 h box search.
Ranks TC1 among all box positions; lists the strongest residual dips; exclusion map for an 8 h dip of 0.80 ppt in pair light
(= the vet's 1.37 ppt on the target, diluted by the 2.3" companion) and the allowed periods."""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, json
from lcio import load_all
from common import *
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
S=[]
for r in load_all(authors=["TESS-SPOC","QLP"]):
    if r["author"]=="QLP" and r["sector"] in range(61,70): continue    # TESS-SPOC covers these
    t=r["t"]; y=r["SAP_FLUX"]; ok=np.isfinite(t)&np.isfinite(y)&(r["q"]==0)&(y>0)
    if ok.sum()<300: continue
    t,y=t[ok],y[ok]/np.median(y[ok])
    # 5-sigma clip of outliers vs model, two passes
    m=np.ones(len(t),bool)
    for _ in range(2):
        mdl=harm_fit(t,y,m); res=y/mdl-1; mad=1.4826*np.median(np.abs(res[m])); m=np.abs(res)<5*mad
    d=y/mdl; keep=d<1+5*mad
    S.append((r["author"],r["sector"],t[keep],d[keep]))
events=[]; allbox=[]
grid_all=[]
for a,s,t,d in S:
    dt=np.median(np.diff(t)); grid=np.arange(t.min()+DUR/2,t.max()-DUR/2,0.02)
    i0=np.searchsorted(t,grid-DUR/2); i1=np.searchsorted(t,grid+DUR/2); cs=np.concatenate([[0],np.cumsum(d-1)]); n=i1-i0
    okc=n>=0.7*DUR/dt; dep=np.where(okc,-(cs[i1]-cs[i0])/np.maximum(n,1),np.nan)
    sig=1.4826*np.nanmedian(np.abs(dep-np.nanmedian(dep)))
    for g,x in zip(grid[okc],dep[okc]): allbox.append((a,s,g,x,sig))
    # local maxima list
    snr=dep/sig; order=np.argsort(-np.nan_to_num(snr,nan=-9)); used=[]
    for k in order[:200]:
        if not np.isfinite(snr[k]) or snr[k]<3: break
        if any(abs(grid[k]-u)<0.5 for u in used): continue
        used.append(grid[k]); events.append(dict(author=a,sector=int(s),t=round(float(grid[k]),3),depth_ppt=round(float(dep[k])*1e3,2),sig_ppt=round(float(sig)*1e3,2),snr=round(float(snr[k]),1),
                                                  phase_sb1=round(float(phase_b(grid[k])),3)))
ev=sorted(events,key=lambda e:-e["snr"])
print("N boxes",len(allbox),"; strongest residual 8 h dips (SNR>=3):")
for e in ev[:20]: print(e)
B=np.array([x[3]/x[4] for x in allbox]); Tb=np.array([x[2] for x in allbox])
k=np.argmin(np.abs(Tb-TC1)); print("TC1 box SNR",B[k],"depth",allbox[k][3]*1e3,"; fraction of all boxes with SNR >= that:",(B>=B[k]).mean(), "; N independent 8 h windows ~",len(B)*0.02/DUR)
k2=np.argmin(np.abs(Tb-TC2)); print("TC2 box SNR",B[k2],"depth",allbox[k2][3]*1e3)
sig_med={a:float(np.median([x[4] for x in allbox if x[0]==a])*1e3) for a in ["TESS-SPOC","QLP"]}; print("median 8 h box sigma ppt:",sig_med)
out=dict(top=ev[:30],TC1_snr=float(B[k]),TC1_depth=float(allbox[k][3]*1e3),TC1_frac_ge=float((B>=B[k]).mean()),TC2_snr=float(B[k2]),TC2_depth=float(allbox[k2][3]*1e3),sigma_8h=sig_med,
         n_ge_TC1=int((B>=B[k]).sum()))
# phase of strong dips relative to the SB1: are residual dips concentrated at conjunction?
ph=np.array([e["phase_sb1"] for e in ev if e["snr"]>=3.5]); out["n_dips_snr3.5"]=len(ph); out["frac_within_0.1_of_conj"]=float((np.abs(ph)<0.1).mean())
print("residual dips SNR>=3.5:",len(ph),"fraction within ±0.1 phase of conjunction (0.2 expected):",out["frac_within_0.1_of_conj"])
# exclusion map + allowed periods for 0.80 ppt (pair light), 8 h
DEP=0.80e-3; RES=0.01; g=np.arange(1300,4100,RES); ex=np.zeros(len(g),bool); cov=np.zeros(len(g),bool)
for a,s,t,d in S:
    dt=np.median(np.diff(t)); i0=np.searchsorted(t,g-DUR/2); i1=np.searchsorted(t,g+DUR/2); cs=np.concatenate([[0],np.cumsum(d-1)]); n=i1-i0
    okc=n>=0.5*DUR/dt; mean=np.where(okc,(cs[i1]-cs[i0])/np.maximum(n,1),np.nan)
    sig=1.4826*np.nanmedian(np.abs(-mean[okc]-np.nanmedian(-mean[okc]))) if okc.any() else 1
    cov|=okc; ex|=okc&(-mean+3*sig<DEP)
print("fraction of covered time where 0.8 ppt/8 h is excluded at 3 sigma:",ex.sum()/max(cov.sum(),1))
P=np.exp(np.arange(np.log(5.0),np.log(3000),3e-5)); allowed=np.ones(len(P),bool)
for k_ in range(-700,700):
    if k_==0: continue
    tk=TC1+k_*P; m=(tk>1300)&(tk<4100-RES)
    if not m.any(): continue
    idx=((tk[m]-1300)/RES).round().astype(int); allowed[np.where(m)[0][ex[idx]]]=False
frac={f"{lo}-{hi} d":float(allowed[(P>=lo)&(P<hi)].mean()) for lo,hi in [(5,30),(30,100),(100,300),(300,1000),(1000,3000)]}
print("allowed fraction by period range:",frac,"shortest allowed",P[allowed].min())
out.update(excl_frac=float(ex.sum()/max(cov.sum(),1)),allowed_frac=frac,shortest_allowed=float(P[allowed].min()))
json.dump(out,open("data/step5_search.json","w"),indent=1)
fig,ax=plt.subplots(figsize=(13,4)); 
for a,s,t,d in S:
    nb=max(int(round((1/24)/np.median(np.diff(t)))),1); n=len(t)//nb
    ax.plot(t[:n*nb].reshape(n,nb).mean(1),(d[:n*nb].reshape(n,nb).mean(1)-1)*1e3,'.',ms=1,color='C0' if a=="QLP" else 'C1')
ax.axvline(TC1,color='r',lw=.6); ax.axvline(TC2,color='m',lw=.6); ax.set_ylim(-5,5); ax.set_xlabel("BTJD"); ax.set_ylabel("residual ppt (1 h bins)")
ax.set_title("All sectors after per-sector harmonic model (orange TESS-SPOC SAP, blue QLP SAP); red TC1, magenta TC2")
plt.tight_layout(); plt.savefig("figs/all_sectors_resid.png",dpi=110)
