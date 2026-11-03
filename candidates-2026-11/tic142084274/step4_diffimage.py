"""Per-pixel depth image at the event (box fit + linear baseline per pixel), and the single deepest QLP cadence minus its neighbours."""
import warnings; warnings.filterwarnings("ignore")
import glob, json, numpy as np, lightkurve as lk
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
from astropy.table import Table
from measure import trapezoid
TC=1635.158; DUR=2/24
tpf=lk.read(glob.glob("data/tesscut/tess-s0012*.fits")[0])
t=tpf.time.value; F=tpf.flux.value.astype(float)
med=np.nanmedian(F,0); onsi=med>10
faint=onsi&(med<np.nanpercentile(med[onsi],40)); bkg=np.nanmedian(F[:,faint],1)
Fb=F-bkg[:,None,None]
w=np.abs(t-TC)<1.0; tt=t[w]; s=trapezoid(tt,TC,DUR)
A=np.vstack([-s,np.ones_like(tt),tt-TC]).T
ny,nx=med.shape; D=np.full((ny,nx),np.nan); E=np.full((ny,nx),np.nan)
for y in range(ny):
    for x in range(nx):
        if not onsi[y,x]: continue
        v=Fb[w,y,x]; c,*_=np.linalg.lstsq(A,v,rcond=None); r=v-A@c
        cov=np.linalg.pinv(A.T@A)*np.var(r); D[y,x]=c[0]; E[y,x]=np.sqrt(cov[0,0])
i0=np.argmin(np.abs(t-1635.1365)); nb=[i0-3,i0-2,i0+2,i0+3]
C=Fb[i0]-np.nanmean(Fb[nb],0)
g=Table.read("data/gaia_2arcmin.csv")
gx,gy=tpf.wcs.world_to_pixel_values(np.array(g["ra"]),np.array(g["dec"]))
xt,yt=gx[0],gy[0]
med_b=np.nanmedian(Fb,0)
ap=np.hypot(*np.meshgrid(np.arange(nx)-xt,np.arange(ny)-yt))<=1.5
star=np.nansum(med_b[ap])
exp22=0.022*med_b   # what a 22 ppt dip of the target would look like per pixel (e/s)
out=dict(depth_in_r1p5_e=float(np.nansum(D[ap])),depth_in_r1p5_ppt=float(np.nansum(D[ap])/star*1e3),
         snr_target_px=float(D[int(round(yt)),int(round(xt))]/E[int(round(yt)),int(round(xt))]),
         expected_22ppt_target_px_e=float(exp22[int(round(yt)),int(round(xt))]),
         measured_target_px_e=float(D[int(round(yt)),int(round(xt))]),err_target_px_e=float(E[int(round(yt)),int(round(xt))]),
         single_cadence_r1p5_ppt=float(-np.nansum(C[ap])/star*1e3))
print(json.dumps(out,indent=1)); json.dump(out,open("data/step4_diffimage.json","w"),indent=1)
fig,ax=plt.subplots(1,4,figsize=(18,4.8))
for a,img,ttl in zip(ax,[np.log10(np.clip(med_b,1,None)),D,exp22,-C],["median image (log e/s), Gaia G<19","per-pixel depth (e/s), 2 h box at 1635.158","expected depth if target dims 22 ppt","-(cadence 1635.137 - neighbours) (e/s)"]):
    vm=None if a is ax[0] else 1.3*exp22[int(round(yt)),int(round(xt))]
    im=a.imshow(img,origin="lower",cmap="viridis" if a is ax[0] else "RdBu_r",vmin=None if vm is None else -vm,vmax=vm)
    plt.colorbar(im,ax=a,fraction=.046); a.set_title(ttl,fontsize=8)
    b=np.array(g["phot_g_mean_mag"])<19
    a.scatter(gx[b],gy[b],s=np.clip((20-np.array(g['phot_g_mean_mag'])[b])*8,5,200),facecolors='none',edgecolors='w' if a is ax[0] else 'k',lw=.7)
    a.plot(xt,yt,'r+',ms=12,mew=2); a.set_xlim(-0.5,nx-0.5); a.set_ylim(-0.5,ny-0.5)
    a.axvline(13.5,color='m',ls='--',lw=1)
fig.suptitle("S12 TESScut 21x21: target (red +), Gaia DR3 (circles), CCD edge (magenta)")
plt.tight_layout(); plt.savefig("figs/diffimage_s12.png",dpi=110)
