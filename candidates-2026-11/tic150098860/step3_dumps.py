"""Is a dip right after a momentum dump typical for this star? Fit an 8h box starting at each dump."""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, json, matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
from lcio import load_all
from measure import fit_depth
P=10.6953065117; T0=3966.946848
lcs=[r for r in load_all() if r["author"]=="SPOC"]
rows=[]
stack={}
for r in lcs:
    t=r["t"]; q=r["q"]
    dump=np.isfinite(t)&((q&32)>0)
    td=t[dump]
    if len(td)==0: continue
    starts=td[np.r_[True,np.diff(td)>0.05]]
    ph=((t-T0+P/2)%P)-P/2
    for col in ["SAP_FLUX","PDCSAP_FLUX"]:
        g=(q==0)&np.isfinite(r[col])&(np.abs(ph)>0.1)
        tt=t[g]; ff=r[col][g]
        for d0 in starts:
            tc=d0+0.333/2+0.005
            w=np.abs(tt-tc)<1.0
            if w.sum()<100: continue
            # need data both before and after dump
            if (tt[w]<d0).sum()<50 or (tt[w]>d0+0.4).sum()<50: continue
            res=fit_depth(tt,ff/np.nanmedian(ff[w]),tc,0.333,1.0,2,min_cov=0.6)
            if res is None or not np.isfinite(res['depth']): continue
            rows.append(dict(sector=r['sector'],col=col,dump=float(d0),depth_ppt=float(res['depth']*1e3),sig=float(res['sig_white']*res['beta']*1e3)))
            if col=="SAP_FLUX":
                m=np.abs(tt-d0)<1.0
                stack.setdefault(r['sector'],[]).append((tt[m]-d0, ff[m]/np.nanmedian(ff[m])))
json.dump(rows,open("data/step3_dumps.json","w"),indent=1)
for col in ["SAP_FLUX","PDCSAP_FLUX"]:
    d=np.array([x['depth_ppt'] for x in rows if x['col']==col])
    print(col, "N dumps",len(d),"median",np.median(d).round(3),"MAD-std",(1.4826*np.median(np.abs(d-np.median(d)))).round(3),
          "frac >=0.7 ppt",(d>=0.7).mean().round(3), "N>=0.7",(d>=0.7).sum())
    big=[x for x in rows if x['col']==col and x['depth_ppt']>=0.6]
    for x in sorted(big,key=lambda x:-x['depth_ppt']): print("   ",x)
    s4=[x for x in rows if x['col']==col and x['sector'] in (1,2,3,4,5)]
    print("  yr1 S1-5:",[(x['sector'],round(x['dump'],2),round(x['depth_ppt'],2)) for x in s4])
# stacked plot of post-dump SAP for all sectors
fig,ax=plt.subplots(figsize=(9,5))
allx=np.concatenate([np.concatenate([a for a,b in v]) for v in stack.values()]); ally=np.concatenate([np.concatenate([b for a,b in v]) for v in stack.values()])
bins=np.arange(-1,1,1/48); idx=np.digitize(allx,bins)
med=[np.nanmedian(ally[idx==i]) for i in range(1,len(bins))]
ax.plot(bins[:-1]+1/96,(np.array(med)-1)*1e3,'k.-',label=f"all {sum(len(v) for v in stack.values())} dumps, SAP median")
r4=[r for r in lcs if r['sector']==4][0]
g=(r4['q']==0)&np.isfinite(r4['SAP_FLUX']); m=np.abs(r4['t']-1416.936)<1
x=r4['t'][g&m]-1416.936; y=r4['SAP_FLUX'][g&m]/np.nanmedian(r4['SAP_FLUX'][g&m]); idx=np.digitize(x,bins)
ax.plot(bins[:-1]+1/96,(np.array([np.nanmedian(y[idx==i]) if (idx==i).sum() else np.nan for i in range(1,len(bins))])-1)*1e3,'r.-',label="S4 dump 1416.936")
ax.axvline(0,color='b'); ax.set_xlabel("t - dump [d]"); ax.set_ylabel("SAP rel. flux [ppt]"); ax.legend(); plt.savefig("figs/step3_dumps.png",dpi=100)
