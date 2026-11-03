"""S32 around the event: quality flags, momentum dumps (QLP bit 32 / SPOC bits 32|1024 over the sector), gaps, background, jitter, centroid step."""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, json
from lcio import load_all
from common import *
TS=2190.358; out={}
for r in load_all(sectors=[32],authors=["TESS-SPOC","QLP"]):
    t,q=r["t"],r["q"]; A=r["author"]; o={}
    d=t[(q&(32|1024))>0]; groups=np.split(d,np.where(np.diff(d)>0.1)[0]+1) if len(d) else []
    o["dumps"]=[round(float(g.mean()),3) for g in groups if len(g)]
    o["flag_values_in_sector"]={int(v):int((q==v).sum()) for v in np.unique(q) if v}
    w=np.abs(t-TC)<0.5; o["flagged_within_0.5d"]={int(v):[round(float(x),3) for x in t[w&(q==v)]] for v in np.unique(q[w]) if v}
    tf=t[np.isfinite(t)]; gi=np.where(np.diff(tf)>0.1)[0]; o["gaps"]=[(round(float(tf[i]),3),round(float(tf[i+1]),3)) for i in gi]
    if "SAP_BKG" in r:
        b=r["SAP_BKG"]; ok=np.isfinite(b)&(q==0)
        def lv(a,c): m=ok&(t>a)&(t<c); return float(np.median(b[m]))
        o["bkg_before_after_step"]=(round(lv(TS-0.5,TS),2),round(lv(TS,TS+0.5),2)); o["bkg_median_sector"]=round(float(np.median(b[ok])),1); o["bkg_p95_sector"]=round(float(np.percentile(b[ok],95)),1)
    for cx in ["MOM_CENTR1","MOM_CENTR2","SAP_X","SAP_Y","POS_CORR1","POS_CORR2"]:
        if cx not in r: continue
        c=r[cx]; ok=np.isfinite(c)&(q==0)
        def lv(a,e): m=ok&(t>a)&(t<e); return float(np.median(c[m]))
        o[f"{cx}_step_mpx"]=round((lv(TS,TS+0.3)-lv(TS-0.3,TS))*1e3,2)
        def jit(m):
            cc=c[m&ok]; nb=6; n=len(cc)//nb
            return float(np.median(cc[:n*nb].reshape(n,nb).std(1))) if n>3 else np.nan
        o[f"{cx}_jitter_in/out"]=round(jit(np.abs(t-TC)<DUR/2)/jit((np.abs(t-TC)>0.5)&(np.abs(t-TC)<3)),2)
    out[A]=o; print(A,json.dumps(o))
json.dump(out,open("data/step3_flags.json","w"),indent=1)
