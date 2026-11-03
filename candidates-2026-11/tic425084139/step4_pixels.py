"""S30 2-min TPF: (a) event deficit image (per-pixel linear baseline over +-0.7 d, in = |t-TC|<3 h, cadences after the 2136.75 dump
excluded from the baseline) and its structure (PSF-like deficit vs a +/- dipole from pointing drift); (b) the same for a pure pointing
template (row-centroid regression); (c) depth in circular apertures r = 1-4 px, with and without background; (d) where the
variability lives (per-pixel regression on the aperture light curve, 1-h bins, per-orbit quadratic removed)."""
import warnings; warnings.filterwarnings("ignore")
import glob, json, numpy as np, lightkurve as lk
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
from astropy.coordinates import SkyCoord; import astropy.units as u
from measure import measure
from common import RA, DEC, TC, DUR
f=glob.glob("data/tpf/**/*s0030*tp.fits",recursive=True)[0]
tpf=lk.read(f); t=tpf.time.value; F=tpf.flux.value.astype(float); q=tpf.quality
g=(q==0)&np.all(np.isfinite(F),axis=(1,2)); t=t[g]; F=F[g]; ap=tpf.pipeline_mask
xt,yt=[float(v) for v in tpf.wcs.world_to_pixel(SkyCoord(RA*u.deg,DEC*u.deg))]
ny,nx=F.shape[1:]; Y,X=np.mgrid[:ny,:nx]; rr=np.hypot(X-xt,Y-yt); med=np.median(F,0)
DUMP=2136.755
inn=np.abs(t-TC)<DUR/2-0.01
bl=(np.abs(t-TC)<0.7)&(np.abs(t-TC)>DUR/2+0.05)
blpre=bl&(t<DUMP)
out=dict(target_px=[xt,yt],aperture_npix=int(ap.sum()))
def defimg(blm):
    Xd=np.vstack([np.ones(blm.sum()),t[blm]-TC]).T; B=np.linalg.lstsq(Xd,F[blm].reshape(blm.sum(),-1),rcond=None)[0]
    return (B[0]-F[inn].reshape(inn.sum(),-1).mean(0)).reshape(ny,nx)
D_all=defimg(bl); D_pre=defimg(blpre)
for lab,D in [("baseline both sides",D_all),("baseline before the dump only",D_pre)]:
    out[lab]=dict(deficit_frac_of_ap_flux=float(D[ap].sum()/med[ap].sum()),sum_pos=float(D[ap][D[ap]>0].sum()),sum_neg=float(D[ap][D[ap]<0].sum()),
                  dipole_index=float(np.abs(D[ap]).sum()/max(abs(D[ap].sum()),1e-9)),
                  peak_px=[int(v) for v in np.unravel_index(np.argmax(D),D.shape)],
                  centroid_offset_px=[float((np.clip(D,0,None)*(X-xt))[rr<3].sum()/np.clip(D,0,None)[rr<3].sum()),float((np.clip(D,0,None)*(Y-yt))[rr<3].sum()/np.clip(D,0,None)[rr<3].sum())])
# expected deficit image for a real dip on the star: the median image times depth
dep=out["baseline both sides"]["deficit_frac_of_ap_flux"]
model=med*dep; out["corr_deficit_vs_star_image"]=float(np.corrcoef(D_all[rr<3].ravel(),med[rr<3].ravel())[0,1])
# pointing template: gradient of median image along row/col times shift
gy_,gx_=np.gradient(med); out["corr_deficit_vs_row_gradient"]=float(np.corrcoef(D_all[rr<3].ravel(),gy_[rr<3].ravel())[0,1]); out["corr_deficit_vs_col_gradient"]=float(np.corrcoef(D_all[rr<3].ravel(),gx_[rr<3].ravel())[0,1])
# regress deficit image on [star image, row gradient, col gradient, const]
m=rr<3; A=np.vstack([med[m],gy_[m],gx_[m],np.ones(m.sum())]).T; c,*_=np.linalg.lstsq(A,D_all[m],rcond=None)
out["deficit_decomposition"]=dict(depth_from_star_image_ppt=float(c[0]*1e3),row_shift_px=float(-c[1]),col_shift_px=float(-c[2]),
   frac_var_explained=float(1-np.var(D_all[m]-A@c)/np.var(D_all[m])))
# aperture growth
bkpx=med<np.percentile(med,25); bk=np.median(F[:,bkpx],1); grow=[]
for r_ in [1.0,1.5,2.0,2.5,3.0,4.0]:
    apc=rr<=r_
    for bs in [False,True]:
        y=F[:,apc].sum(1)-(bk*apc.sum() if bs else 0); mm=measure(t,y,TC,DUR,win=1.0)
        grow.append(dict(r=r_,npix=int(apc.sum()),bkg_sub=bs,depth_ppt=round(mm['depth']*1e3,2),sig=round(mm['sig_adopt']*1e3,2)))
mm=measure(t,F[:,ap].sum(1),TC,DUR,win=1.0); grow.append(dict(r="SPOC ap",npix=int(ap.sum()),depth_ppt=round(mm['depth']*1e3,2),sig=round(mm['sig_adopt']*1e3,2)))
out["aperture_growth"]=grow
# variability location (1 h bins, per-orbit quadratic removed)
tb=np.arange(t.min(),t.max()+1/24,1/24); idx=np.digitize(t,tb); keep=[i for i in np.unique(idx) if (idx==i).sum()>15]
T=np.array([t[idx==i].mean() for i in keep]); FB=np.array([F[idx==i].mean(0) for i in keep]); lc=FB[:,ap].sum(1); tm=lc/np.median(lc)-1
orb=T>2130.0
def detr(y):
    r=y.copy()
    for o in [~orb,orb]:
        cc=np.polyfit(T[o]-T[o].mean(),y[o],2); r[o]=y[o]-np.polyval(cc,T[o]-T[o].mean())
    return r
tmd=detr(tm); Aimg=np.array([[np.dot(detr(FB[:,i,j]),tmd)/np.dot(tmd,tmd) for j in range(nx)] for i in range(ny)])
out["variability"]=dict(amp_frac_in_core_px=float(Aimg[int(round(yt)),int(round(xt))]/med[int(round(yt)),int(round(xt))]),
                        A_over_flux_in_aperture=float(Aimg[ap].sum()/med[ap].sum()),corr_with_star_image=float(np.corrcoef(Aimg[rr<3].ravel(),med[rr<3].ravel())[0,1]))
print(json.dumps(out,indent=1)); json.dump(out,open("data/step4_pixels.json","w"),indent=1)
fig,ax=plt.subplots(1,4,figsize=(19,4.5))
for a,img,ttl in zip(ax,[med,D_all,D_pre,Aimg],["S30 median","event deficit (baseline both sides)","event deficit (baseline before dump)","variability amplitude"]):
    v=np.percentile(np.abs(img),99); im=a.imshow(img,origin='lower',cmap='viridis' if ttl.startswith('S30') else 'RdBu_r',vmin=None if ttl.startswith('S30') else -v,vmax=None if ttl.startswith('S30') else v)
    a.contour(ap,levels=[0.5],colors='k',linewidths=.8); a.plot(xt,yt,'m+',ms=12); a.set_title(ttl); plt.colorbar(im,ax=a,fraction=.046)
fig.tight_layout(); fig.savefig("figs/step4_pixels.png",dpi=90)
