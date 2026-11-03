"""Loader for every downloaded light-curve product: QLP (all columns) and the year-1 HLSPs.
Returns a list of dicts: author, sector, t (BTJD), good (bool mask), cols {name: flux array normalised later}."""
import glob, re, numpy as np
from astropy.io import fits
def _sec(f):
    m=re.search(r"s00(\d\d)",f); return int(m.group(1))
def load():
    out=[]
    for f in sorted(glob.glob("data/lc/**/*.fits", recursive=True)):
        n=f.split("/")[-1].lower(); h=fits.open(f); d=h[1].data; s=_sec(n)
        if "hlsp_qlp" in n:
            t=np.array(d["TIME"],float); q=np.array(d["QUALITY"],int)
            cols={c:np.array(d[c],float) for c in ["SAP_FLUX","KSPSAP_FLUX","KSPSAP_FLUX_SML","KSPSAP_FLUX_LAG","DET_FLUX","SYS_RM_FLUX","SAP_BKG","SAP_X","SAP_Y"] if c in d.columns.names}
            out.append(dict(author="QLP",sector=s,t=t,good=q==0,cols=cols,camera=h[0].header.get("CAMERA"),ccd=h[0].header.get("CCD"),file=f))
        elif "eleanor" in n:
            t=np.array(d["TIME"],float); q=np.array(d["QUALITY"],int)
            cols={c:np.array(d[c],float) for c in ["RAW_FLUX","CORR_FLUX","PCA_FLUX","FLUX_BKG","X_CENTROID","Y_CENTROID"]}
            out.append(dict(author="ELEANOR-LITE",sector=s,t=t,good=q==0,cols=cols,file=f))
        elif "hlsp_t16" in n:
            t=np.array(d["TMID_BJD"],float); t=t-2457000 if np.nanmedian(t)>2e6 else t
            cols={}
            for c in ["IRM1","IRM2","IRM3","EPD1","EPD2","EPD3","TFA1","TFA2","TFA3"]:
                m=np.array(d[c],float); cols[c]=10**(-0.4*(m-np.nanmedian(m)))
            cols["BGV"]=np.array(d["BGV"],float)
            out.append(dict(author="T16",sector=s,t=t,good=np.isfinite(t),cols=cols,file=f))
        elif "tasoc" in n:
            kind="ENS" if "ens-lc" in n else "CBV"
            t=np.array(d["TIME"],float); q=np.array(d["QUALITY"],int)
            cols={"FLUX_RAW":np.array(d["FLUX_RAW"],float),"FLUX_CORR_"+kind:np.array(d["FLUX_CORR"],float),"FLUX_BKG":np.array(d["FLUX_BKG"],float)}
            out.append(dict(author="TASOC-"+kind,sector=s,t=t,good=q==0,cols=cols,file=f))
        elif "tglc" in n:
            t=np.array(d["time"],float); q=np.array(d["TESS_flags"],int); q2=np.array(d["TGLC_flags"],int)
            cols={c:np.array(d[c],float) for c in ["psf_flux","aperture_flux","cal_psf_flux","cal_aper_flux","background"]}
            out.append(dict(author="TGLC",sector=s,t=t,good=(q==0)&(q2==0),cols=cols,file=f))
        elif "tars" in n:
            t=np.array(d.columns.names and d[d.columns.names[0]],float)
            out.append(dict(author="TARS",sector=s,t=t,good=np.isfinite(t),cols={c:np.array(d[c],float) for c in d.columns.names[1:] if d[c].dtype.kind=="f"},file=f))
    return out
