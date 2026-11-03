"""Slide the sweep statistic (6 h trapezoid, +-1 d quadratic) over QLP's detrended flux (DET_FLUX S61+, KSPSAP S1-39) in all sectors.
List the deepest dips and brightenings and their distance to the nearest flare in the census."""
import numpy as np, json
from lcio import load_all
from measure import fit_depth
F=json.load(open("data/step5_var_flares.json"))["flares"]
ft=np.array([f["t0"] for f in F]); fa=np.array([f["amp_ppt"] for f in F])
rows=[]
for r in load_all():
    c="DET_FLUX" if "DET_FLUX" in r else "KSPSAP_FLUX"
    t=r["t"]; f=r[c]; g=np.isfinite(t)&np.isfinite(f)&(r["q"]==0); t=t[g]; f=f[g]/np.nanmedian(f[g])
    for tc in np.arange(t.min()+0.3,t.max()-0.3,0.05):
        m=fit_depth(t,f,tc,0.25,1.0,2,min_cov=0.7)
        if m is None or not np.isfinite(m["depth"]): continue
        rows.append((r["sector"],c,tc,m["depth"]*1e3,m["sig_white"]*1e3))
rows=np.array(rows,dtype=object)
dep=rows[:,3].astype(float); sw=rows[:,4].astype(float); tcs=rows[:,2].astype(float)
def extrema(sign):
    order=np.argsort(-sign*dep); picked=[]
    for i in order:
        if all(abs(tcs[i]-tcs[j])>0.5 for j in picked): picked.append(i)
        if len(picked)>=25: break
    return picked
out={}
for name,sign in [("dips",1),("brightenings",-1)]:
    print("==",name)
    L=[]
    for i in extrema(sign):
        d=tcs[i]-ft; k=np.argmin(np.abs(d))
        L.append(dict(sector=int(rows[i,0]),col=rows[i,1],tc=float(tcs[i]),depth_ppt=float(dep[i]),snr=float(dep[i]/sw[i]),nearest_flare_dt=float(d[k]),flare_amp=float(fa[k])))
        print(L[-1])
    out[name]=L
# rate of events >= the event's depth (4.0 ppt in DET), both signs, within 1 d of a flare vs not
thr=3.3
for name,sign in [("dips",1),("brightenings",-1)]:
    sel=extrema(sign); n=sum(sign*dep[i]>=thr for i in sel)
    nf=sum((sign*dep[i]>=thr) and np.min(np.abs(tcs[i]-ft))<0.6 for i in sel)
    print(name,">=",thr,"ppt:",n,"(of top 25) ; within 0.6 d of a census flare:",nf)
    out[name+"_n_ge_thr"]=int(n); out[name+"_n_near_flare"]=int(nf)
json.dump(out,open("data/step5_search.json","w"),indent=1)
