"""Depth at TC (5.4 h trapezoid) in every S32 product/column: measure.py (±1 d quadratic, red-noise errors) and a line+step(2190.358)+dip model.
Also the half-depths (first vs second half of the box) without a step term, the vet's 'asymmetric' lead."""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, json
from lcio import load_all
from measure import measure, trapezoid
from common import *
TS=2190.358; rows=[]
for r in load_all(sectors=[32]):
    for c in ["SAP_FLUX","PDCSAP_FLUX","KSPSAP_FLUX","KSPSAP_FLUX_SML","KSPSAP_FLUX_LAG","FLUX"]:
        if c not in r: continue
        t=r["t"]; y=r[c].copy(); ok=np.isfinite(y)&np.isfinite(t)&(r["q"]==0); y[~ok]=np.nan; y=y/np.nanmedian(y)
        m=measure(t,y,TC,DUR,1.0,2)
        w=ok&(np.abs(t-TC)<1.0); x=t[w]-TC; f=y[w]; S=(t[w]>TS).astype(float); D=-trapezoid(t[w],TC,DUR)
        h1=-((t[w]>TC-DUR/2)&(t[w]<TC)).astype(float); h2=-((t[w]>=TC)&(t[w]<TC+DUR/2)).astype(float)
        A=np.vstack([np.ones_like(x),x,S,D]).T; c1=np.linalg.lstsq(A,f,rcond=None)[0]; e1=np.sqrt(np.linalg.pinv(A.T@A)[3,3]*np.var(f-A@c1))
        B=np.vstack([np.ones_like(x),x,x**2,h1,h2]).T; c2=np.linalg.lstsq(B,f,rcond=None)[0]
        row=dict(author=r["author"],col=c,depth_ppt=round(m["depth"]*1e3,2),sig_adopt=round(m["sig_adopt"]*1e3,2),beta=round(m["beta"],2),frac_deeper=round(m["frac_deeper"],3),
                 depth_with_step_ppt=round(c1[3]*1e3,2),sig_white_with_step=round(e1*1e3,2),step_ppt=round(c1[2]*1e3,2),first_half_ppt=round(c2[3]*1e3,2),second_half_ppt=round(c2[4]*1e3,2))
        rows.append(row); print(row)
json.dump(rows,open("data/step2_archival.json","w"),indent=1)
