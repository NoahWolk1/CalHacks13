"""The sweep statistic (6 h trapezoid on a +-1 d quadratic baseline, measure.fit_depth) slid every 0.05 d over every
SPOC 2-min sector (PDCSAP and SAP, 20-min bins, quality=0). Independent extrema are kept (>=0.4 d apart). Reports the
rank of the two vetted events among dips, and the number of brightenings at least as large. Also the same for
TESS-SPOC PDCSAP. Depths in PDCSAP are in units of the target's light (SPOC divides by CROWDSAP ~0.055); SAP depths are
in units of the whole aperture."""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, json
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
from lcio import load_all
from measure import fit_depth
from common import TC, DUR
EV=[TC,3946.77]
def binned(t,f,w=1/72):
    tb=np.arange(t.min(),t.max()+w,w); i=np.digitize(t,tb); c=np.bincount(i); s=np.bincount(i,weights=f)
    k=np.where(c>=3)[0]; return np.array([t[i==j].mean() for j in k]) if False else (tb[k-1]+w/2), s[k]/c[k]
out={}; fig,axs=plt.subplots(1,3,figsize=(17,4.5))
for ai,(au,col) in enumerate([("SPOC","PDCSAP_FLUX"),("SPOC","SAP_FLUX"),("TESS-SPOC","PDCSAP_FLUX")]):
    rows=[]
    for r in [x for x in load_all() if x['author']==au]:
        g=(r['q']==0)&np.isfinite(r[col]); 
        if g.sum()<100: continue
        t,f=r['t'][g],r[col][g]/np.nanmedian(r[col][g])
        if np.median(np.diff(t))<0.005: t,f=binned(t,f)
        for tc in np.arange(t.min()+0.15,t.max()-0.15,0.05):
            w=np.abs(t-tc)<1
            res=fit_depth(t[w],f[w]/np.median(f[w]),tc,DUR,1.0,2,min_cov=0.8)
            if res is None or not np.isfinite(res.get('depth',np.nan)): continue
            rows.append((int(r['sector']),tc,res['depth']*1e3))
    R=np.array(rows)
    def extrema(sign):
        order=np.argsort(-sign*R[:,2]); used=[]; pk=[]
        for i in order:
            if any(abs(R[i,1]-u_)<0.4 for u_ in used): continue
            used.append(R[i,1]); pk.append(R[i])
        return np.array(pk)
    dips=extrema(+1); bri=extrema(-1)
    res=dict(n_positions=len(R),n_independent=len(dips),sectors=int(len(np.unique(R[:,0]))))
    for tc in EV:
        near=dips[np.abs(dips[:,1]-tc)<0.3]
        if not len(near): res[f"event_{tc}"]="no coverage at >=80%"; continue
        d=near[np.argmax(near[:,2])]
        res[f"event_{tc}"]=dict(t=round(float(d[1]),2),depth_ppt=round(float(d[2]),2),rank_among_dips=int((dips[:,2]>=d[2]).sum()),
                                n_brightenings_as_large=int((-bri[:,2]>=d[2]).sum()))
    res["top10_dips"]=[(int(p[0]),round(float(p[1]),2),round(float(p[2]),2)) for p in dips[:10]]
    res["top5_brightenings"]=[(int(p[0]),round(float(p[1]),2),round(float(p[2]),2)) for p in bri[:5]]
    res["dip_depth_percentiles_50_90_99"]=[round(float(np.percentile(dips[:,2],q)),2) for q in (50,90,99)]
    out[f"{au}_{col}"]=res; print(au,col,json.dumps(res))
    a=axs[ai]; a.hist(dips[:,2],bins=80,alpha=.6,label='dips'); a.hist(-bri[:,2],bins=80,alpha=.6,label='brightenings (sign flipped)')
    for tc in EV:
        v=res.get(f"event_{tc}")
        if isinstance(v,dict): a.axvline(v['depth_ppt'],color='r'); 
    a.set_title(f"{au} {col}: 6 h box extrema, {res['sectors']} sectors"); a.set_xlabel('ppt'); a.legend()
fig.tight_layout(); fig.savefig('figs/step3_dipscan.png',dpi=85)
json.dump(out,open('data/step3_dipscan.json','w'),indent=1)
