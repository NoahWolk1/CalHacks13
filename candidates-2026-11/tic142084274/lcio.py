"""Shared loader for all downloaded light curves (SPOC 2-min, TESS-SPOC FFI, QLP, eleanor-lite)."""
import glob, numpy as np
from astropy.io import fits
COLS=["SAP_FLUX","PDCSAP_FLUX","KSPSAP_FLUX","DET_FLUX","SAP_BKG","MOM_CENTR1","MOM_CENTR2","SAP_X","SAP_Y",
      "RAW_FLUX","CORR_FLUX","PCA_FLUX","FLUX_BKG","X_CENTROID","Y_CENTROID","KSPSAP_FLUX_SML","KSPSAP_FLUX_LAG"]
def author_of(f):
    f=f.lower()
    if "qlp" in f: return "QLP"
    if "eleanor" in f: return "ELEANOR-LITE"
    if "tess-spoc" in f: return "TESS-SPOC"
    return "SPOC"
def load_all(authors=None, sectors=None):
    out=[]
    for f in sorted(glob.glob("data/lc/**/*.fits", recursive=True)):
        a=author_of(f)
        if authors and a not in authors: continue
        h=fits.open(f); hd=h[0].header; d=h[1].data
        if sectors and hd["SECTOR"] not in sectors: continue
        cols=d.columns.names
        rec=dict(file=f, author=a, sector=hd["SECTOR"], camera=hd.get("CAMERA"), ccd=hd.get("CCD"),
                 t=np.array(d["TIME"],float), q=np.array(d["QUALITY"],int), cols=cols)
        for c in COLS:
            if c in cols: rec[c]=np.array(d[c],float)
        rec["hdr1"]=dict(h[1].header); rec["hdr0"]=dict(hd)
        out.append(rec)
    return out
