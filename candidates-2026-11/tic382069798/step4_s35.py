"""Is the S32 one-pixel step a one-off? Per-pixel step map at the S35 level shift (2266.635, 4.5 ppt in SAP), from TESScut."""
import warnings; warnings.filterwarnings("ignore")
import glob, json, numpy as np, lightkurve as lk
from common import *
out={}
for s,ts in [(35,2266.635)]:
    f=glob.glob(f"data/tesscut/**/tess-s00{s}*.fits",recursive=True)
    tp=lk.read(f[0]) if f else lk.search_tesscut(f"TIC {TIC}",sector=s).download(cutout_size=21,download_dir="data/tesscut")
    t=tp.time.value; F=tp.flux.value.astype(float); ok=np.all(np.isfinite(F),axis=(1,2))&(tp.quality==0)
    w=ok&(np.abs(t-ts)<0.6); tt=t[w]; Fw=F[w]; med=np.median(F[ok],0)
    bkg=np.median(Fw[:,med<np.percentile(med,30)],1); Fb=Fw-bkg[:,None,None]
    x=tt-ts; S=(tt>ts).astype(float); M=np.vstack([np.ones_like(x),x,S]).T; P=np.linalg.pinv(M)
    st=np.einsum('k t, t y x -> k y x',P,Fb)[2]
    xt,yt=[float(v) for v in tp.wcs.world_to_pixel_values(RA,DEC)]
    j,i=np.unravel_index(np.argmax(np.abs(st)),st.shape)
    out[f"S{s}"]=dict(cam_ccd=(tp.camera,tp.ccd),target_px=(xt,yt),max_step_pixel=(int(i),int(j)),max_step_e_s=float(st[j,i]),pix_flux=float(med[j,i]),dist_px=float(np.hypot(i-xt,j-yt)),
        second_largest=float(np.sort(np.abs(st).ravel())[-2]))
    print(s,out[f"S{s}"])
    for jj in range(int(yt)+3,int(yt)-4,-1): print(" ".join(f"{st[jj,ii]:6.1f}" for ii in range(int(xt)-3,int(xt)+4)))
json.dump(out,open("data/step4_s35.json","w"),indent=1,default=str)
