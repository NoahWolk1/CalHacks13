import warnings; warnings.filterwarnings("ignore")
import numpy as np, json
from lcio import load_all
from measure import measure
P=10.6953065117; T0=3966.946848
def toimask(t, half=0.1):
    ph=((t-T0+P/2)%P)-P/2; return np.abs(ph)<half
lcs=load_all(); out=[]
cases=[(4,1417.097,0.333,"8h box",True),(98,4009.601,0.333,"8h box (TOI-220b unmasked)",False),
       (98,4009.601,0.333,"8h box, TOI-220b masked",True),(98,4009.728,0.085,"TOI-220b ephemeris, 2.0h",False)]
for s,tc,dur,lab,mask in cases:
    print(f"== S{s} tc={tc} dur={dur*24:.1f}h {lab}")
    for r in lcs:
        if r["sector"]!=s: continue
        for col in ["PDCSAP_FLUX","SAP_FLUX","KSPSAP_FLUX"]:
            if col not in r: continue
            t=r["t"]; f=r[col].copy(); g=(r["q"]==0)&np.isfinite(f)&np.isfinite(t)
            if mask: g&=~toimask(t)
            res=measure(t[g],f[g],tc,dur,win=1.0)
            if res is None or not np.isfinite(res.get("depth",np.nan)): print(f"  {r['author']:9s} {col:12s} insufficient", res and res.get('cov')); continue
            d=dict(sector=s,tc=tc,dur=dur,case=lab,author=r['author'],col=col,depth_ppt=res['depth']*1e3,sig_adopt_ppt=res['sig_adopt']*1e3,
                   sig_white_ppt=res['sig_white']*1e3,beta=res['beta'],sig_emp_ppt=res['sig_emp']*1e3,frac_deeper=res['frac_deeper'],cov=res['cov'])
            out.append(d)
            print(f"  {r['author']:9s} {col:12s} depth {d['depth_ppt']:6.2f} +- {d['sig_adopt_ppt']:.2f} ppt (white {d['sig_white_ppt']:.2f}, beta {d['beta']:.2f}, emp {d['sig_emp_ppt']:.2f}) frac_deeper {d['frac_deeper']:.3f} cov {d['cov']:.2f}")
json.dump(out,open("data/step2_archival.json","w"),indent=1)
