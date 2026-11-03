import warnings; warnings.filterwarnings("ignore")
import numpy as np, json
from lcio import load_all
from measure import measure
TC=1635.158; DUR=2/24; out={}
for r in load_all(sectors=[12]):
    t,q=r["t"],r["q"]
    d=t[(q&32)>0]; groups=np.split(d,np.where(np.diff(d)>0.1)[0]+1) if len(d) else []
    tf=t[np.isfinite(t)]; gi=np.where(np.diff(tf)>0.1)[0]
    w=np.abs(t-TC)<0.5
    flagged={int(v):[round(x,4) for x in t[w&(q==v)]] for v in np.unique(q[w]) if v!=0}
    o=dict(dumps=[round(g.mean(),3) for g in groups],gaps=[(round(tf[i],3),round(tf[i+1],3)) for i in gi],span=(round(tf.min(),3),round(tf.max(),3)),flagged_within_0p5d=flagged)
    if (q&4096).any():
        s=t[(q&4096)>0]; gs=np.split(s,np.where(np.diff(s)>0.1)[0]+1); o["scattered_light_4096_ranges"]=[(round(g.min(),3),round(g.max(),3)) for g in gs]
    print(r["author"], json.dumps(o)); out[r["author"]]=o
    if r["author"]=="ELEANOR-LITE":
        for c in ["RAW_FLUX","PCA_FLUX","CORR_FLUX"]:
            y=r[c].copy(); y[~np.isin(q,[0,128])]=np.nan
            # remove gross outliers using a robust clip far from event
            for o_ in [1,2]:
                m=measure(t,y,TC,DUR,1.0,o_)
                print(f"  eleanor {c} q in(0,128) order{o_}: {m['depth']*1e3:.2f} +- {m['sig_adopt']*1e3:.2f} ppt (emp {m['sig_emp']*1e3:.2f}) fdeeper {m['frac_deeper']:.3f} rms {m['rms']*1e3:.1f}")
                out[f"eleanor_{c}_o{o_}"]=(m['depth']*1e3,m['sig_adopt']*1e3)
json.dump(out,open("data/step3_flags.json","w"),indent=1)
