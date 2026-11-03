import warnings; warnings.filterwarnings("ignore")
import numpy as np
from lcio import load_all
from lightkurve.utils import TessQualityFlags as F
TC=1635.158
for r in load_all(sectors=[12]):
    t=r["t"]; w=np.abs(t-TC)<0.4
    print("\n",r["author"])
    cs=[c for c in ["SAP_FLUX","KSPSAP_FLUX","RAW_FLUX","CORR_FLUX","PCA_FLUX","SAP_BKG","FLUX_BKG","SAP_X","SAP_Y","X_CENTROID","Y_CENTROID"] if c in r]
    med={c:np.nanmedian(r[c][np.abs(t-TC)<2]) for c in cs}
    print("t        q   "+"  ".join(f"{c[:10]:>10}" for c in cs))
    for i in np.where(w)[0]:
        vals=[]
        for c in cs:
            v=r[c][i]
            vals.append(f"{(v/med[c]-1)*1e3:10.1f}" if "FLUX" in c and "BKG" not in c else f"{v:10.3f}")
        print(f"{t[i]:.4f} {r['q'][i]:6d} "+"  ".join(vals))
