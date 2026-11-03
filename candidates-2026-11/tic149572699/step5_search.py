"""Box search of every sector (QLP SAP, plus TESS-SPOC SAP/PDCSAP if present), q=0 cadences, at the event duration.
Records dips AND brightenings (local extrema), their SNR against the sector's own spread of box depths (red-noise aware),
distance to the nearest gap / flagged stretch, and the QLP background slope. Writes data/step5_search.json."""
import warnings, json, sys; warnings.filterwarnings("ignore")
import numpy as np
from lcio import load_all
from measure import fit_depth
from common import EVENTS
dur=EVENTS[0][2]; tc0=EVENTS[0][1]
prods=sys.argv[1:] or ["QLP:SAP_FLUX"]
out=dict(dur_h=dur*24,products=prods,hits=[],sectors=[])
for pr in prods:
    au,col=pr.split(":")
    for r in load_all():
        if r["author"]!=au or col not in r: continue
        t=r["t"]; f=r[col]; q=r["q"]
        g=(q==0)&np.isfinite(f)&np.isfinite(t)
        if g.sum()<200: continue
        tt=t[g]; ff=f[g]/np.nanmedian(f[g])
        # bin to >=10 min for speed
        dt=np.nanmedian(np.diff(tt))
        if dt<0.005:
            k=3; n=len(tt)//k; tt=tt[:n*k].reshape(n,k).mean(1); ff=ff[:n*k].reshape(n,k).mean(1)
        bk=r.get("SAP_BKG"); 
        grid=np.arange(tt.min()+0.1,tt.max()-0.1,0.02)
        dd=[]
        for tc in grid:
            res=fit_depth(tt,ff,tc,dur,1.0,2,min_cov=0.7)
            if res is None or not np.isfinite(res["depth"]): continue
            dd.append((tc,res["depth"],res["sig_white"]))
        dd=np.array(dd)
        if len(dd)<50: continue
        rob=1.4826*np.median(np.abs(dd[:,1]-np.median(dd[:,1])))
        snr=(dd[:,1]-np.median(dd[:,1]))/rob
        # gaps / flagged stretches: times of q!=0 or missing
        bad=t[(q!=0)|~np.isfinite(f)]
        gapedges=np.r_[tt[np.r_[np.diff(tt)>0.1,False]],tt[np.r_[False,np.diff(tt)>0.1]],tt.min(),tt.max()]
        out["sectors"].append(dict(prod=pr,sector=r["sector"],n=len(dd),scatter_ppt=round(rob*1e3,3),span=[round(tt.min(),2),round(tt.max(),2)]))
        for sgn in (1,-1):
            s=sgn*snr
            for i in np.where(s>3.5)[0]:
                lo,hi=max(0,i-10),i+11
                if s[i]==s[lo:hi].max():
                    tc=dd[i,0]
                    h=dict(prod=pr,sector=r["sector"],kind="dip" if sgn>0 else "bright",tc=round(tc,3),depth_ppt=round(dd[i,1]*1e3,2),
                           snr=round(float(s[i]),1),scatter_ppt=round(rob*1e3,3),
                           d_gap=round(float(np.min(np.abs(gapedges-tc))),2),
                           d_flag=round(float(np.min(np.abs(bad-tc))) if len(bad) else 99,2))
                    if bk is not None:
                        w=np.abs(t-tc)<dur; wb=np.abs(t-tc)<1.0
                        h["bkg_slope_rel"]=round(float(np.nanmax(bk[w])-np.nanmin(bk[w]))/max(1e-9,float(np.nanpercentile(bk[wb],95)-np.nanpercentile(bk[wb],5))),2) if w.sum()>3 else None
                        h["bkg_range_in_box"]=round(float(np.nanmax(bk[w])-np.nanmin(bk[w])),1) if w.sum()>3 else None
                    out["hits"].append(h)
        print(pr,r["sector"],"scatter",round(rob*1e3,3),"ppt", flush=True)
H=out["hits"]
for kind in ["dip","bright"]:
    hk=sorted([h for h in H if h["kind"]==kind],key=lambda x:-x["snr"])
    print(f"\n{kind}s >3.5: {len(hk)}; >5: {sum(h['snr']>5 for h in hk)}; >6: {sum(h['snr']>6 for h in hk)}")
    for h in hk[:20]: print(h)
json.dump(out,open("data/step5_search.json","w"),indent=1)
