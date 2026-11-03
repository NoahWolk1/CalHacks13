"""Quality flags, momentum dumps, gaps, scattered-light flags and pointing jitter around both events."""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, json
from lcio import load_all
from common import *
out={}
for tc,sec in [(TC1,65),(TC2,95)]:
    for r in load_all(sectors=[sec],authors=["TESS-SPOC","QLP"]):
        t,q=r["t"],r["q"]; key=f"S{sec} {r['author']}"
        dumpbit=32 if r["author"]=="TESS-SPOC" else 32
        d=t[(q&(32|1024))>0]; groups=np.split(d,np.where(np.diff(d)>0.1)[0]+1) if len(d) else []
        dumps=[round(float(g.mean()),3) for g in groups if len(g)]
        tf=t[np.isfinite(t)]; gi=np.where(np.diff(tf)>0.1)[0]
        w=np.abs(t-tc)<0.5
        flagged={int(v):int((w&(q==v)).sum()) for v in np.unique(q[w]) if v!=0}
        o=dict(span=(round(float(np.nanmin(t)),3),round(float(np.nanmax(t)),3)),gaps=[(round(float(tf[i]),3),round(float(tf[i+1]),3)) for i in gi],
               dumps_within_1d=[x for x in dumps if abs(x-tc)<1],nearest_dump=min(dumps,key=lambda x:abs(x-tc)) if dumps else None,
               flagged_cadences_within_0p5d=flagged,n_within_0p5d=int(w.sum()),
               dist_to_nearest_gap_edge=float(min([abs(tc-x) for g in [(tf[i],tf[i+1]) for i in gi] for x in g]+[abs(tc-tf.min()),abs(tc-tf.max())])))
        # jitter: 1 h std of centroids
        for cx in ["MOM_CENTR1","MOM_CENTR2","SAP_X","SAP_Y"]:
            if cx not in r: continue
            c=r[cx]; ok=np.isfinite(c)&(q==0)
            def jit(m):
                tt=t[m&ok]; cc=c[m&ok]
                if len(tt)<20: return np.nan
                nb=max(int(round((1/24)/np.median(np.diff(tt)))),2); n=len(cc)//nb
                return float(np.median(cc[:n*nb].reshape(n,nb).std(1)))
            jin=jit(np.abs(t-tc)<DUR/2); jout=jit((np.abs(t-tc)>0.5)&(np.abs(t-tc)<3))
            o[f"jitter_{cx}_in/out"]=round(jin/jout,2) if jout else None
            # centroid shift in vs out (local)
            win=(np.abs(t-tc)<1)&ok; ins=win&(np.abs(t-tc)<DUR/2)
            o[f"centroid_shift_{cx}_mpx"]=round(float((np.median(c[ins])-np.median(c[win&~ins]))*1e3),2)
        if "SAP_BKG" in r:
            b=r["SAP_BKG"]; ok=np.isfinite(b)&(q==0); win=(np.abs(t-tc)<1)&ok; ins=win&(np.abs(t-tc)<DUR/2)
            o["bkg_in_minus_out_e/s"]=round(float(np.median(b[ins])-np.median(b[win&~ins])),2); o["bkg_median_e/s"]=round(float(np.median(b[win])),1)
            yy=r["SAP_FLUX"]; okk=win&np.isfinite(yy); o["r_flux_bkg_1d"]=round(float(np.corrcoef(yy[okk],b[okk])[0,1]),2)
        print(key,json.dumps(o)); out[key]=o
json.dump(out,open("data/step3_flags.json","w"),indent=1)
