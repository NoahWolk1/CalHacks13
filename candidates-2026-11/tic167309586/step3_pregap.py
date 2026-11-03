"""(a) S90 gap-edge feature: depth of an 8 h trapezoid centred at 3768.17 (half in the gap) in neighbours' SAP vs target.
(b) How often does the target's own SAP/PDCSAP show a >=1 ppt 'dip' at tc just before a gap/momentum dump, across all SPOC 2-min sectors?"""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, glob, json, pickle
from astropy.io import fits
from measure import fit_depth
from lcio import load_all
from common import DUR
out={"s90_neighbours_at_3768.17":[]}
for f in glob.glob("data/lc_neighbor/**/*s0090*.fits",recursive=True):
    h=fits.open(f); d=h[1].data; t=np.array(d["TIME"],float); q=np.array(d["QUALITY"])
    rec=dict(tic=h[0].header["TICID"],ccd=h[0].header["CCD"])
    for c in ["SAP_FLUX","PDCSAP_FLUX"]:
        y=np.array(d[c],float); y[q!=0]=np.nan; y/=np.nanmedian(y)
        fr=fit_depth(t,y,3768.17,DUR,win=1.0,order=2,min_cov=0.3); rec[c]=round(float(fr["depth"])*1e3,2) if fr and np.isfinite(fr.get("depth",np.nan)) else None
    out["s90_neighbours_at_3768.17"].append(rec)
for r in out["s90_neighbours_at_3768.17"]: print(r)
G=pickle.load(open("data/depthgrid.pkl","rb"))
L=load_all(); pre=[]
for r in L:
    if r["author"]!="SPOC": continue
    t=r["t"]; g=np.isfinite(t)&np.isfinite(r["SAP_FLUX"])&(r["q"]==0); tf=t[g]
    starts=list(tf[np.where(np.diff(tf)>0.1)[0]])+list(np.unique(np.round(t[(r["q"]&32)>0],2)))
    for col in ["SAP_FLUX","PDCSAP_FLUX"]:
        gg=G[(int(r["sector"]),"SPOC",col)]
        for ts in starts:
            # deepest grid depth with tc in [ts-0.25, ts+0.02]
            w=(gg["grid"]>ts-0.25)&(gg["grid"]<ts+0.02)&np.isfinite(gg["depth"])
            if w.sum(): pre.append((int(r["sector"]),col,round(float(ts),2),round(float(np.nanmax(gg["depth"][w]))*1e3,2)))
pre=np.array(pre,dtype=object)
for col in ["SAP_FLUX","PDCSAP_FLUX"]:
    v=np.array([p[3] for p in pre if p[1]==col],float)
    print(col,"pre-gap/dump windows:",len(v),"frac >=1 ppt: %.3f, >=2 ppt: %.3f, median %.2f"%((v>=1).mean(),(v>=2).mean(),np.median(v)))
    out[f"pregap_{col}"]=dict(n=len(v),frac_ge1=float((v>=1).mean()),frac_ge2=float((v>=2).mean()),median=float(np.median(v)))
# baseline: the same statistic at random times
rng=np.random.default_rng(0)
for col in ["SAP_FLUX","PDCSAP_FLUX"]:
    vals=[]
    for (s,a,c),gg in G.items():
        if a!="SPOC" or c!=col: continue
        ok=np.isfinite(gg["depth"])&(gg["cov"]>=0.8); vals+=list(gg["depth"][ok])
    v=np.array(vals)*1e3
    print(col,"all grid tc (cov>=0.8): frac >=1 ppt %.3f, >=2 ppt %.4f"%((v>=1).mean(),(v>=2).mean()))
    out[f"anytime_{col}"]=dict(frac_ge1=float((v>=1).mean()),frac_ge2=float((v>=2).mean()))
json.dump(out,open("data/step3_pregap.json","w"),indent=1)
