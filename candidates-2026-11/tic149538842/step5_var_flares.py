"""Rotation/orbital modulation (LS per sector) and a flare census over all QLP sectors (SAP, q=0)."""
import numpy as np, json, matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
from astropy.timeseries import LombScargle
from scipy.ndimage import median_filter
from lcio import load_all
L=load_all(); out={"sectors":{}, "flares":[]}
fig,ax=plt.subplots(2,1,figsize=(13,8))
allt=[];ally=[]
for r in L:
    t=r["t"]; f=r["SAP_FLUX"]; g=np.isfinite(t)&np.isfinite(f)&(r["q"]==0); t=t[g]; y=f[g]/np.nanmedian(f[g])
    if len(t)<200: continue
    fr=np.linspace(1/20,3,4000); pw=LombScargle(t,y).power(fr); P=1/fr[np.argmax(pw)]
    p2p=np.percentile(y,98)-np.percentile(y,2)
    # flares: residual from 0.5 d running median, >= 3 consecutive cadences above 3 sigma, peak >= 5 ppt
    dt=np.median(np.diff(t)); n=int(0.5/dt)|1; base=median_filter(y,n,mode='nearest'); res=y-base
    sd=1.4826*np.median(np.abs(res-np.median(res)))
    nbin=max(1,int(round(1800/(dt*86400))))  # bin to 30 min to treat cadences equally
    tb=t[:len(t)//nbin*nbin].reshape(-1,nbin).mean(1); rb=res[:len(t)//nbin*nbin].reshape(-1,nbin).mean(1)
    sdb=1.4826*np.median(np.abs(rb-np.median(rb)))
    hi=rb>4*sdb; lo=rb<-4*sdb
    def runs(m):
        ev=[];i=0
        while i<len(m):
            if m[i]:
                j=i
                while j+1<len(m) and m[j+1]: j+=1
                if j-i+1>=2: ev.append((tb[i],tb[j],float(rb[i:j+1].max() if m is hi else rb[i:j+1].min())))
                i=j+1
            else: i+=1
        return ev
    fh=runs(hi); fl=runs(lo)
    out["sectors"][r["sector"]]=dict(P_LS=P,p2p_ppt=p2p*1e3,sd30_ppt=sdb*1e3,n_bright=len(fh),n_dim=len(fl),span=float(t.max()-t.min()),cad_s=dt*86400)
    for e in fh: out["flares"].append(dict(sector=r["sector"],t0=e[0],t1=e[1],amp_ppt=e[2]*1e3))
    print(r["sector"], f"P={P:.2f} d p2p={p2p*1e3:.0f} ppt sd30={sdb*1e3:.2f} bright={[(round(a,2),round(c*1e3,1)) for a,b,c in fh]} dim={[(round(a,2),round(c*1e3,1)) for a,b,c in fl]}")
    ax[0].plot(t,y,'.',ms=0.5)
json.dump(out,open("data/step5_var_flares.json","w"),indent=1,default=float)
Ps=[v["P_LS"] for v in out["sectors"].values()]; print("median P",np.median(Ps), "total bright",sum(v["n_bright"] for v in out["sectors"].values()),"dim",sum(v["n_dim"] for v in out["sectors"].values()))
plt.savefig("figs/step5_all_sap.png",dpi=80)
