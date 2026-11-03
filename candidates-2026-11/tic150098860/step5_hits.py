"""For the strongest search hits: distance to nearest gap edge (>0.1 d) and momentum dump; SAP depth."""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, json
from lcio import load_all
from measure import measure
from common import P_B,T0_B
H=json.load(open("data/step5_search.json"))["hits"]
H=sorted(H,key=lambda x:-x['snr_vs_scatter'])[:8]
L={r['sector']:r for r in load_all() if r['author']=='SPOC'}
for h in H:
    r=L[h['sector']]; t=r['t']; q=r['q']; fin=np.isfinite(t)&np.isfinite(r['PDCSAP_FLUX'])&(q==0)
    tf=t[fin]; br=np.where(np.diff(tf)>0.1)[0]; edges=np.r_[tf[0],tf[br],tf[br+1],tf[-1]]
    dumps=t[np.isfinite(t)&((q&32)>0)]
    ph=((t-T0_B+P_B/2)%P_B)-P_B/2; g=fin&(np.abs(ph)>0.1)
    ms=measure(t[g],r['SAP_FLUX'][g],h['tc'],0.333)
    print(h['sector'],h['tc'],h['depth_ppt'],h['snr_vs_scatter'],"| nearest edge %.2f d, nearest dump %.2f d"%(np.min(np.abs(edges-h['tc'])),np.min(np.abs(dumps-h['tc'])) if len(dumps) else np.nan),
          "| SAP %.2f+-%.2f"%(ms['depth']*1e3,ms['sig_adopt']*1e3) if ms and np.isfinite(ms.get('depth',np.nan)) else "")
