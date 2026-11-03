"""Shared loader for all downloaded light curves (TESS-SPOC FFI, QLP, TARS)."""
import glob, numpy as np
from astropy.io import fits
COLS=["SAP_FLUX","PDCSAP_FLUX","KSPSAP_FLUX","DET_FLUX","SYS_RM_FLUX","SAP_BKG","MOM_CENTR1","MOM_CENTR2","POS_CORR1","POS_CORR2","SAP_X","SAP_Y","FLUX",
      "DET_FLUX_SML","DET_FLUX_LAG","KSPSAP_FLUX_SML","KSPSAP_FLUX_LAG"]
def author_of(f):
    f=f.lower()
    if "qlp" in f: return "QLP"
    if "tars" in f: return "TARS"
    if "eleanor" in f: return "ELEANOR-LITE"
    if "tess-spoc" in f: return "TESS-SPOC"
    return "SPOC"
def load_all(authors=None, sectors=None):
    out=[]
    for f in sorted(glob.glob("data/lc/**/*.fits", recursive=True)):
        a=author_of(f)
        if authors and a not in authors: continue
        h=fits.open(f); hd=h[0].header; d=h[1].data
        sec=hd.get("SECTOR")
        if sec is None:
            import re; sec=int(re.search(r"s00(\d\d)",f).group(1))
        if sectors and sec not in sectors: continue
        cols=d.columns.names
        t=np.array(d["TIME"],float)
        rec=dict(file=f, author=a, sector=sec, camera=hd.get("CAMERA"), ccd=hd.get("CCD"),
                 t=t, q=np.array(d["QUALITY"],int) if "QUALITY" in cols else np.zeros(len(t),int), cols=cols)
        for c in COLS:
            if c in cols: rec[c]=np.array(d[c],float)
        rec["hdr1"]=dict(h[1].header); rec["hdr0"]=dict(hd)
        out.append(rec)
    return out
