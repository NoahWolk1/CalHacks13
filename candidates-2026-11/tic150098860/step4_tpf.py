"""S4 SPOC 2-min TPF: per-pixel in-event deficit vs. PSF; transit-on-target => deficit image ~ mean image (const ratio);
pointing jitter => deficit concentrated in PSF wings, sign changes. Also aperture photometry in several apertures."""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, json, lightkurve as lk, matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
from measure import measure
sr=lk.search_targetpixelfile("TIC 150098860",author="SPOC",exptime=120,sector=4)
tpf=sr[0].download(download_dir="data/tpf")
t=tpf.time.value; F=tpf.flux.value.astype(float); q=tpf.quality
g=(q==0)&np.all(np.isfinite(F),axis=(1,2))
pipe=tpf.pipeline_mask
tc=1417.097; dur=0.333
inn=g&(np.abs(t-tc)<0.12)                       # deep core 1416.98-1417.22
oot=g&(np.abs(t-tc)>0.3)&(np.abs(t-tc)<0.9)&(t<1418.45)
img=np.nanmedian(F[g],0)
# local linear baseline per pixel: fit each pixel OOT with quadratic in time, evaluate in-transit
D=np.zeros_like(img)
for (i,j),_ in np.ndenumerate(img):
    c=np.polyfit(t[oot]-tc,F[oot,i,j],2); D[i,j]=np.polyval(c,t[inn]-tc).mean()-F[inn,i,j].mean()
ratio=D/img
res={}
ap_tot=D[pipe].sum()/img[pipe].sum(); res['pipeline_ap_deficit_ppt']=float(ap_tot*1e3)
print("pipeline aperture deficit in core (ppt)",ap_tot*1e3, "npix",pipe.sum())
# per-pixel within pipeline aperture: bright core vs wings
bright=pipe&(img>np.percentile(img[pipe],60)); wing=pipe&~bright
res['core_ratio_ppt']=float(D[bright].sum()/img[bright].sum()*1e3); res['wing_ratio_ppt']=float(D[wing].sum()/img[wing].sum()*1e3)
print("core pixels ratio",res['core_ratio_ppt'],"wing pixels",res['wing_ratio_ppt'])
# bigger aperture (pipeline + 1 px dilation) -> jitter losses shrink, transit depth stays
from scipy.ndimage import binary_dilation
for k,ap in [("pipeline",pipe),("dilate1",binary_dilation(pipe)),("dilate2",binary_dilation(pipe,iterations=2)),("core3x3",np.zeros_like(pipe))]:
    if k=="core3x3":
        yy,xx=np.unravel_index(np.argmax(img),img.shape); ap[yy-1:yy+2,xx-1:xx+2]=True
    bk=np.zeros(len(t))  # SPOC TPF flux is background-subtracted already
    lc=F[:,ap].sum(1); y=lc.copy(); y[~g]=np.nan
    m=measure(t,y,tc,dur)
    res[f"ap_{k}"]=dict(npix=int(ap.sum()),depth_ppt=round(m['depth']*1e3,2),sig=round(m['sig_adopt']*1e3,2),frac_deeper=round(m['frac_deeper'],3))
    print(k,res[f"ap_{k}"])
json.dump(res,open("data/step4_tpf.json","w"),indent=1)
fig,ax=plt.subplots(1,3,figsize=(13,4))
a=ax[0].imshow(img,origin='lower'); ax[0].set_title('median image'); plt.colorbar(a,ax=ax[0])
v=np.nanmax(np.abs(D)); a=ax[1].imshow(D,origin='lower',cmap='RdBu_r',vmin=-v,vmax=v); ax[1].set_title('in-event deficit (OOT-IN) e/s'); plt.colorbar(a,ax=ax[1])
rr=np.where(img>0.02*img.max(),ratio*1e3,np.nan); a=ax[2].imshow(rr,origin='lower',cmap='RdBu_r',vmin=-5,vmax=5); ax[2].set_title('deficit/flux [ppt]'); plt.colorbar(a,ax=ax[2])
for x in ax:
    yy,xx=np.where(pipe); x.plot(xx,yy,'k+',ms=4)
plt.tight_layout(); plt.savefig("figs/step4_tpf_S4.png",dpi=100)
