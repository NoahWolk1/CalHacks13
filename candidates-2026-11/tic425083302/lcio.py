"""Shared loader for all downloaded light curves (SPOC 2-min, TESS-SPOC, QLP, TGLC, GSFC-ELEANOR-LITE)."""
import glob, numpy as np
from astropy.io import fits
_cache=None
MAP={"TGLC":{"time":"TIME","cal_aper_flux":"TGLC_APER","cal_psf_flux":"TGLC_PSF","aperture_flux":"SAP_FLUX","background":"SAP_BKG","TESS_flags":"QUALITY"},
     "ELEANOR":{"RAW_FLUX":"SAP_FLUX","CORR_FLUX":"ELE_CORR","PCA_FLUX":"ELE_PCA","FLUX_BKG":"SAP_BKG"}}
def load_all(authors=None):
    global _cache
    if _cache is None:
        out=[]
        for f in sorted(glob.glob("data/lc/**/*.fits", recursive=True)):
            try: h=fits.open(f)
            except Exception as e: print("skip",f,e); continue
            hd=h[0].header; d=h[1].data; fl=f.lower()
            author = "QLP" if "hlsp_qlp" in fl else "TGLC" if "tglc" in fl else "ELEANOR" if "eleanor" in fl else ("TESS-SPOC" if "tess-spoc" in fl else "SPOC")
            cols=list(d.columns.names); m=MAP.get(author,{})
            g=lambda c: np.array(d[c],float)
            tcol=[c for c in cols if c.upper()=="TIME"][0]
            qcol="TESS_flags" if author=="TGLC" else "QUALITY"
            q=np.array(d[qcol],int)
            if author=="TGLC": q=q|(np.array(d["TGLC_flags"],int)<<20)
            rec=dict(file=f, author=author, sector=hd["SECTOR"], camera=hd.get("CAMERA"), ccd=hd.get("CCD"), t=g(tcol), q=q, cols=cols)
            for c in cols:
                key=m.get(c,c)
                if key in ["SAP_FLUX","PDCSAP_FLUX","KSPSAP_FLUX","KSPSAP_FLUX_SML","KSPSAP_FLUX_LAG","DET_FLUX","SYS_RM_FLUX","SAP_BKG","MOM_CENTR1","MOM_CENTR2","SAP_X","SAP_Y","PDCSAP_FLUX_ERR","KSPSAP_FLUX_ERR","SAP_FLUX_ERR","TGLC_APER","TGLC_PSF","ELE_CORR","ELE_PCA","ORBITID"]:
                    rec[key]=g(c)
            rec["hdr1"]=dict(h[1].header); rec["hdr0"]=dict(hd)
            out.append(rec)
        _cache=out
    return [r for r in _cache if authors is None or r["author"] in authors]
