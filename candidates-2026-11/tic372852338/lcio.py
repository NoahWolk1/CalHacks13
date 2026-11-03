"""Shared loader for downloaded light curves (QLP; year-1 ELEANOR-lite/TASOC are skipped: they don't cover the events)."""
import glob, numpy as np
from astropy.io import fits
_cache=None
def load_all():
    global _cache
    if _cache is not None: return _cache
    out=[]
    for f in sorted(glob.glob("data/lc/**/*.fits", recursive=True)):
        fl=f.lower()
        if "hlsp_qlp" in fl: author="QLP"
        elif "tess-spoc" in fl: author="TESS-SPOC"
        elif "tess2" in fl and "_lc.fits" in fl: author="SPOC"
        else: continue
        h=fits.open(f); hd=h[0].header; d=h[1].data
        cols=d.columns.names
        rec=dict(file=f, author=author, sector=hd["SECTOR"], camera=hd.get("CAMERA"), ccd=hd.get("CCD"), t=np.array(d["TIME"],float),
                 q=np.array(d["QUALITY"],int), cols=cols)
        for c in ["SAP_FLUX","PDCSAP_FLUX","KSPSAP_FLUX","DET_FLUX","SYS_RM_FLUX","SAP_BKG","MOM_CENTR1","MOM_CENTR2","SAP_X","SAP_Y","KSPSAP_FLUX_ERR","SAP_FLUX_ERR","KSPSAP_FLUX_SML","KSPSAP_FLUX_LAG","ORBITID"]:
            if c in cols: rec[c]=np.array(d[c],float)
        rec["hdr1"]=dict(h[1].header); rec["hdr0"]=dict(hd)
        out.append(rec)
    _cache=out
    return out
