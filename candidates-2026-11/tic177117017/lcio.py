"""Shared loader for all downloaded light curves."""
import glob, numpy as np
from astropy.io import fits
def load_all():
    out=[]
    for f in sorted(glob.glob("data/lc/**/*.fits", recursive=True)):
        h=fits.open(f); hd=h[0].header; d=h[1].data
        author = "QLP" if "qlp" in f.lower() else "TESS-SPOC"
        cols=d.columns.names
        rec=dict(file=f, author=author, sector=hd["SECTOR"], t=np.array(d["TIME"],float),
                 q=np.array(d["QUALITY"],int), cols=cols)
        for c in ["SAP_FLUX","PDCSAP_FLUX","KSPSAP_FLUX","DET_FLUX","SAP_BKG","MOM_CENTR1","MOM_CENTR2","SAP_X","SAP_Y","PDCSAP_FLUX_ERR","KSPSAP_FLUX_ERR","SAP_FLUX_ERR"]:
            if c in cols: rec[c]=np.array(d[c],float)
        rec["hdr1"]=dict(h[1].header); rec["hdr0"]=dict(hd)
        out.append(rec)
    return out
