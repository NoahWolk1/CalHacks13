"""Own TESScut photometry for the QLP-only S89 dip at BTJD 3735.03 (vet's 'secondary eclipse')."""
import warnings; warnings.filterwarnings("ignore")
import glob, json, numpy as np, lightkurve as lk
from astropy.coordinates import SkyCoord; import astropy.units as u
from astropy.stats import sigma_clipped_stats
from measure import measure, trapezoid
RA,DEC=98.12203,-74.85380; TC=3735.03; DUR=2/24
fs=glob.glob("data/tesscut/tess-s0089*.fits")
tpf=lk.read(fs[0]) if fs else lk.search_tesscut("TIC 142084274",sector=89).download(cutout_size=21,download_dir="data/tesscut")
t=tpf.time.value; F=tpf.flux.value.astype(float); q=tpf.quality
fin=np.all(np.isfinite(F),axis=(1,2)); med=np.nanmedian(F[fin],0); onsi=med>10
xt,yt=[float(v) for v in tpf.wcs.world_to_pixel(SkyCoord(RA*u.deg,DEC*u.deg))]
print("target px",xt,yt,"on-silicon rows",np.where(onsi.any(1))[0].min(),np.where(onsi.any(1))[0].max())
Y,X=np.mgrid[:F.shape[1],:F.shape[2]]; r=np.hypot(X-xt,Y-yt)
faint=onsi&(med<np.nanpercentile(med[onsi],40))&(r>3)
bk={"global faint-40%":np.nanmedian(F[:,faint],1)}
ann=onsi&(r>4)&(r<8); bk["annulus clipped"]=np.array([sigma_clipped_stats(f[ann])[1] for f in F])
out={}
for name,b in bk.items():
    for rap in [1.0,1.5,2.5]:
        ap=(r<=rap)&onsi; lc=np.nansum(F[:,ap]-b[:,None],1); lc[~fin]=np.nan
        m=measure(t,lc,TC,DUR,1.0,1)
        out[f"{name} r={rap}"]=(round(m['depth']*1e3,2),round(m['sig_adopt']*1e3,2))
        print(name,rap,"npix",ap.sum(),out[f"{name} r={rap}"])
        if name=="global faint-40%" and rap==1.5:
            li=lc*(1-0.0145*trapezoid(t,TC,DUR)); mi=measure(t,li,TC,DUR,1.0,1); print("  inject 14.5 ppt ->",round(mi['depth']*1e3,2),"+-",round(mi['sig_adopt']*1e3,2))
            out["inject14.5"]=(round(mi['depth']*1e3,2),round(mi['sig_adopt']*1e3,2))
json.dump(out,open("data/step5_s89.json","w"),indent=1)
