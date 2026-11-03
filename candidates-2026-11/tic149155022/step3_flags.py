"""Quality flags, momentum dumps, gaps and orbit edges near each event (QLP + TESScut quality), and the pointing (QLP centroid) jitter."""
import warnings; warnings.filterwarnings("ignore")
import glob, json, numpy as np, lightkurve as lk
from lcio import load_all
from cfg import *
evs=[(TC,None)]+([(TC2,None)] if "TC2" in globals() else [])
out={}
for tc,_ in evs:
    o={}
    for r in load_all(authors=["QLP","ELEANOR-LITE","TASOC-CBV"]):
        t,q=r["t"],r["q"]
        if not (t.min()<tc<t.max()): continue
        w=np.abs(t-tc)<1.0
        o[r["author"]+"_flags_within_1d"]={int(v):int((q[w]==v).sum()) for v in np.unique(q[w]) if v!=0}
        o[r["author"]+"_flagged_in_transit"]=int((q[np.abs(t-tc)<DUR/2]!=0).sum())
        tf=t[np.isfinite(t)]; gi=np.where(np.diff(tf)>0.2)[0]; o[r["author"]+"_gaps"]=[(round(tf[i],2),round(tf[i+1],2)) for i in gi]
        o[r["author"]+"_dist_to_nearest_gap_or_edge_d"]=round(float(min([abs(tc-x) for g in o[r["author"]+"_gaps"] for x in g]+[tc-tf.min(),tf.max()-tc])),2)
        if r["author"]=="QLP":
            x=r["SAP_X"]; y=r["SAP_Y"]; g=(q==0)&np.isfinite(x)
            def jit(m): 
                xx=x[m&g]; yy=y[m&g]; return float(np.sqrt(np.std(np.diff(xx))**2+np.std(np.diff(yy))**2))
            o["QLP_jitter_in_transit_over_sector_median"]=round(jit(np.abs(t-tc)<DUR/2)/np.median([jit(np.abs(t-x0)<DUR/2) for x0 in np.arange(t.min()+0.5,t.max()-0.5,0.5)]),2)
            o["QLP_bkg_at_tc"]=round(float(np.interp(tc,t[g],r["SAP_BKG"][g])),1); o["QLP_bkg_sector_median"]=round(float(np.nanmedian(r["SAP_BKG"][g])),1)
            o["QLP_bkg_slope_per_day_at_tc"]=round(float(np.polyfit(t[g&(np.abs(t-tc)<0.3)],r["SAP_BKG"][g&(np.abs(t-tc)<0.3)],1)[0]),1)
    for f in glob.glob("data/tesscut/**/*.fits",recursive=True):
        tp=lk.read(f); t=tp.time.value
        if not (np.nanmin(t)<tc<np.nanmax(t)): continue
        q=tp.quality.astype(int); dumps=t[(q&32)>0]; o["tesscut_momentum_dumps_within_2d"]=[round(x,3) for x in dumps[np.abs(dumps-tc)<2]]
        o["tesscut_flags_within_1d"]={int(v):int((q[np.abs(t-tc)<1]==v).sum()) for v in np.unique(q[np.abs(t-tc)<1]) if v!=0}
    out[str(tc)]=o; print(tc,json.dumps(o,default=str))
json.dump(out,open("data/step3_flags.json","w"),indent=1,default=str)
