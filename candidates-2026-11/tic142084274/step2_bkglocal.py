import warnings; warnings.filterwarnings("ignore")
import numpy as np, json
from lcio import load_all
TC=1635.158
q=load_all(authors=["QLP"],sectors=[12])[0]
t,f,b=q["t"],q["SAP_FLUX"],q["SAP_BKG"]; g=np.isfinite(f)&np.isfinite(b)
print("median SAP_FLUX", np.nanmedian(f[g]), "median SAP_BKG", np.nanmedian(b[g]))
out={}
for lab,m in [("+-1d",np.abs(t-TC)<1),("+-3d",np.abs(t-TC)<3),("orbit1",t<1638.5),("orbit2",t>1639.5)]:
    mm=g&m
    df=f[mm]-np.median(f[mm]); db=b[mm]-np.median(b[mm])
    # remove linear trends
    for y in (df,db):
        p=np.polyfit(t[mm],y,2); y-=np.polyval(p,t[mm])
    r=np.corrcoef(df,db)[0,1]; k=np.polyfit(db,df,1)[0]
    print(f"{lab}: N={mm.sum()} r={r:.3f} dFlux/dBkg={k:.3f} (e-/s per bkg unit)")
    out[lab]=dict(N=int(mm.sum()),r=r,slope=k)
i=np.argmin(np.abs(t-1635.1368))
print("cadence 1635.1368: flux - local median =", f[i]-np.median(f[g&(np.abs(t-TC)<1)]), " bkg - local median =", b[i]-np.median(b[g&(np.abs(t-TC)<1)]))
json.dump(out,open("data/step2_bkglocal.json","w"),indent=1)
