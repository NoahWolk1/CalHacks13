"""S5 SPOC: quality flags, momentum dumps, gaps, background, centroid/jitter around 1456.295."""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, json
from lcio import load_all
TC,DUR=1456.295,0.15
r=[x for x in load_all(authors=["SPOC"],sectors=[5])][0]; t,q=r["t"],r["q"]
d=t[(q&32)>0]; dumps=sorted(set(np.round(d,2)))
o=dict(dumps_within_2d=[x for x in dumps if abs(x-TC)<2],flags_within_0p3d={int(v):int(((np.abs(t-TC)<0.3)&(q==v)).sum()) for v in np.unique(q[np.abs(t-TC)<0.3]) if v})
tf=t[np.isfinite(t)]; gi=np.where(np.diff(tf)>0.05)[0]; o["gaps_within_2d"]=[(round(float(tf[i]),3),round(float(tf[i+1]),3)) for i in gi if abs(tf[i]-TC)<2]
ok=(q==0)&np.isfinite(r["SAP_FLUX"]); win=ok&(np.abs(t-TC)<0.6); ins=win&(np.abs(t-TC)<DUR/2)
b=r["SAP_BKG"]; o["bkg_in_minus_out_e/s"]=float(np.median(b[ins])-np.median(b[win&~ins])); o["bkg_median_e/s"]=float(np.median(b[win])); o["sap_median_e/s"]=float(np.median(r["SAP_FLUX"][win]))
for c in ["MOM_CENTR1","MOM_CENTR2","POS_CORR1","POS_CORR2"]:
    v=r[c]; o[f"{c}_shift_mpx"]=float((np.nanmedian(v[ins])-np.nanmedian(v[win&~ins]))*1e3)
    def jit(m):
        x=v[m]; n=len(x)//30; return float(np.median(x[:n*30].reshape(n,30).std(1)))
    o[f"{c}_jitter_in/out"]=jit(ins)/jit(win&~ins)
print(json.dumps(o,indent=0)); json.dump(o,open("data/step3_flags.json","w"),indent=1)
