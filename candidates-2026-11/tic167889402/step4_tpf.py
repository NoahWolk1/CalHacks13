"""S96 2-min TPF: own aperture photometry in growing apertures and a per-pixel deficit image.
Each light curve / pixel is fit as  a*(1 + k*P(t)) + per-orbit quadratic + box(TC,DUR)
where P(t) is the 40-frequency pulsation model from the multi-sector SAP prewhitening
(fixed shape; k absorbs dilution)."""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, json, glob, matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
from astropy.io import fits
from scipy.ndimage import binary_dilation
from measure import trapezoid
from common import TC, DUR
f=glob.glob("data/tpf/**/*s0096*_tp.fits",recursive=True)[0]
h=fits.open(f); d=h[1].data; ap=h[2].data
t=d['TIME']; fl=d['FLUX']; bk=d['FLUX_BKG']; q=d['QUALITY']
pt,pr,ps,pm=np.load("data/prewhiten_resid_SAP_FLUX.npy")
g=(q==0)&np.isfinite(t)&np.all(np.isfinite(fl.reshape(len(t),-1)),1)
P=np.interp(t,pt,pm)  # pulsation model
win=1.5
sel=g&(np.abs(t-TC)<win)
tt=t[sel]; box=trapezoid(tt,TC,DUR)
seg=(tt>3914.3).astype(int)  # gap at 3914.2-3914.4 splits the window
def fitlc(y, retres=False):
    y=y/np.nanmedian(y)
    cols=[-box, P[sel]]
    for sgi in [0,1]:
        m=(seg==sgi).astype(float)
        if m.sum()<10: continue
        x=tt-TC
        for k in range(3): cols.append(m*x**k)
    A=np.vstack(cols).T; c,*_=np.linalg.lstsq(A,y,rcond=None); r=y-A@c
    cov=np.linalg.pinv(A.T@A)*np.var(r)
    # red-noise beta at ~DUR/2
    n=int(round(DUR/2/(2/1440))); nb=len(r)//n; rb=r[:nb*n].reshape(nb,n).mean(1)
    beta=max(1,np.std(rb)/(np.std(r)/np.sqrt(n)))
    out=dict(depth=c[0]*1e3, sig=np.sqrt(cov[0,0])*beta*1e3, k=c[1], beta=beta)
    if retres: out['res']=r
    return out
pipe=(ap & 2)>0
img=np.nanmedian(fl[g],0)
core=np.zeros_like(pipe); iy,ix=np.unravel_index(np.nanargmax(img),img.shape); core[iy-1:iy+2,ix-1:ix+2]=True
aps={"3x3 core":core,"SPOC aperture":pipe,"SPOC +1 px":binary_dilation(pipe),"SPOC +2 px":binary_dilation(pipe,iterations=2)}
res={}
for name,a in aps.items():
    y=fl[sel][:,a].sum(1)
    for bname,yy in [("bkg-subtracted",y),("bkg added back",y+bk[sel][:,a].sum(1))]:
        r=fitlc(yy); res[f"{name} | {bname}"]=dict(npix=int(a.sum()),**{k:float(v) for k,v in r.items()})
        print(f"{name:14s} {a.sum():3d} px {bname:15s}: depth {r['depth']:.3f} +- {r['sig']:.3f} ppt, pulsation scale k {r['k']:.3f}, beta {r['beta']:.2f}")
# background itself
bkg=bk[sel][:,pipe].sum(1); fluxap=fl[sel][:,pipe].sum(1)
cb=np.polyfit(tt-TC,bkg,2); 
print("bkg in-box minus out-of-box (e/s, aperture sum):", bkg[box>0.5].mean()-bkg[box<0.01].mean(), " vs star flux", np.median(fluxap), " -> ", (bkg[box>0.5].mean()-bkg[box<0.01].mean())/np.median(fluxap)*1e3,"ppt")
# per-pixel deficit
dimg=np.full(img.shape,np.nan); simg=np.full(img.shape,np.nan)
for yx in np.ndindex(img.shape):
    y=fl[sel][:,yx[0],yx[1]]
    if img[yx]<50: continue
    r=fitlc(y); dimg[yx]=r['depth']*img[yx]/1e3; simg[yx]=r['sig']*img[yx]/1e3   # e/s deficit
# centroid of the deficit vs the star
w=np.where(np.isfinite(dimg))
fig,ax=plt.subplots(1,3,figsize=(15,5))
ax[0].imshow(img,origin='lower'); ax[0].contour(pipe,[0.5],colors='w'); ax[0].set_title("S96 median image")
v=np.nanmax(np.abs(dimg)); im=ax[1].imshow(dimg,origin='lower',cmap='RdBu_r',vmin=-v,vmax=v); plt.colorbar(im,ax=ax[1]); ax[1].contour(pipe,[0.5],colors='k'); ax[1].set_title("in-box deficit (e/s), pulsation-regressed")
im=ax[2].imshow(dimg/simg,origin='lower',cmap='RdBu_r',vmin=-4,vmax=4); plt.colorbar(im,ax=ax[2]); ax[2].set_title("deficit / sigma")
plt.savefig("figs/step4_tpf_s96.png",dpi=100)
tot=np.nansum(dimg[pipe]); print("sum of per-pixel deficit in SPOC aperture:",tot," e/s =",tot/np.nansum(img[pipe])*1e3,"ppt")
# pixel-level: deficit fraction per pixel versus pixel brightness (a PSF-shaped on-target dip has constant fractional depth)
frac=dimg/img*1e3
for lo,hi in [(0.3,1.01),(0.05,0.3),(0.01,0.05)]:
    m=pipe&(img/img.max()>=lo)&(img/img.max()<hi)
    if m.sum(): print(f"pixels at {lo}-{hi} of peak ({m.sum()} px): deficit {np.nansum(dimg[m])/np.nansum(img[m])*1e3:.3f} ppt")
json.dump(res,open("data/step4_tpf.json","w"),indent=1)
np.save("data/step4_deficit.npy",np.array([img,dimg,simg]))
