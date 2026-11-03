"""Loader for all downloaded light curves: QLP, GSFC-ELEANOR-LITE, TGLC, TASOC.
Each record: author, sector, t, q (0 = good), and a dict of flux columns (normalised later)."""
import glob, numpy as np
from astropy.io import fits
_cache=None
COLS={"QLP":["SAP_FLUX","KSPSAP_FLUX","DET_FLUX","SYS_RM_FLUX","KSPSAP_FLUX_SML","KSPSAP_FLUX_LAG","DET_FLUX_SML","DET_FLUX_LAG"],
      "ELEANOR":["RAW_FLUX","CORR_FLUX","PCA_FLUX"],
      "TGLC":["psf_flux","aperture_flux","cal_psf_flux","cal_aper_flux"],
      "TASOC-CBV":["FLUX_RAW","FLUX_CORR"],"TASOC-ENS":["FLUX_RAW","FLUX_CORR"]}
AUX=["SAP_BKG","SAP_X","SAP_Y","FLUX_BKG","X_CENTROID","Y_CENTROID","X_COM","Y_COM","background","MOM_CENTR1","MOM_CENTR2","ORBITID"]
def load_all():
    global _cache
    if _cache is not None: return _cache
    out=[]
    for f in sorted(glob.glob("data/lc/**/*.fits", recursive=True)):
        fl=f.lower()
        if "hlsp_t16" in fl: continue   # corrupt download
        h=fits.open(f); hd=h[0].header; d=h[1].data; cols=d.columns.names
        if "hlsp_qlp" in fl: a="QLP"
        elif "eleanor" in fl: a="ELEANOR"
        elif "tglc" in fl: a="TGLC"
        elif "tasoc" in fl: a="TASOC-ENS" if "ens-lc" in fl else "TASOC-CBV"
        tcol="time" if "time" in cols else "TIME"
        t=np.array(d[tcol],float)
        if a=="TGLC":
            q=np.array(d["TESS_flags"],int)|np.array(d["TGLC_flags"],int)
        else: q=np.array(d["QUALITY"],int)
        rec=dict(file=f, author=a, sector=int(hd["SECTOR"]), camera=hd.get("CAMERA"), ccd=hd.get("CCD"), t=t, q=q, flux={}, aux={})
        for c in COLS[a]:
            if c in cols: rec["flux"][c]=np.array(d[c],float)
        for c in AUX:
            if c in cols: rec["aux"][c]=np.array(d[c],float)
        out.append(rec)
    _cache=out
    return out
