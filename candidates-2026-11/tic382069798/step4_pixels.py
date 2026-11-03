"""S32 TESScut, per-pixel: (a) step image: level after minus before 2190.358 (±0.6 d windows, per-pixel line + step + dip fit),
(b) dip image: the 5.4 h trapezoid amplitude fitted jointly with the step, (c) dip-only image (no step term, as a pipeline would see it).
Plus own aperture photometry r = 1, 1.5, 2, 3 px with and without the step term, and the TESS-SPOC aperture mask from the TP file."""
import warnings; warnings.filterwarnings("ignore")
import glob, json, numpy as np, lightkurve as lk
from astropy.table import Table
from astropy.coordinates import SkyCoord; import astropy.units as u
from measure import trapezoid, measure
from common import *
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
TS=2190.358
tpf=lk.read(glob.glob("data/tesscut/**/tess-s0032*.fits",recursive=True)[0])
t=tpf.time.value; F=tpf.flux.value.astype(float); q=tpf.quality
ok=np.all(np.isfinite(F),axis=(1,2))&(q==0)
w=ok&(np.abs(t-TC)<1.0); tt=t[w]; Fw=F[w]
med=np.nanmedian(F[ok],0); ny,nx=med.shape
Y,X=np.mgrid[:ny,:nx]
gaia=Table.read("data/gaia_2arcmin.csv")
# propagate Gaia (2016) to S32 epoch (2020.9) for target
gx,gy=tpf.wcs.world_to_pixel_values(np.array(gaia["ra"]),np.array(gaia["dec"]))
xt,yt=float(gx[0]),float(gy[0]); r=np.hypot(X-xt,Y-yt)
faint=(med<np.nanpercentile(med,30))&(r>5); bkg=np.nanmedian(Fw[:,faint],1)
Fb=Fw-bkg[:,None,None]
x=tt-TC; S=(tt>TS).astype(float); D=-trapezoid(tt,TC,DUR)
M1=np.vstack([np.ones_like(x),x,S,D]).T; M0=np.vstack([np.ones_like(x),x,x**2,D]).T
P1=np.linalg.pinv(M1); P0=np.linalg.pinv(M0)
step=np.zeros((ny,nx)); dipS=np.zeros((ny,nx)); dip0=np.zeros((ny,nx)); estep=np.zeros((ny,nx))
for j in range(ny):
    for i in range(nx):
        v=Fb[:,j,i]; c=P1@v; step[j,i]=c[2]; dipS[j,i]=c[3]; rr=v-M1@c; estep[j,i]=np.sqrt(np.linalg.pinv(M1.T@M1)[2,2]*np.var(rr))
        dip0[j,i]=(P0@v)[3]
out=dict(target_px=(xt,yt),bkg_median=float(np.median(bkg)),bkg_step=float(np.mean(bkg[S>0])-np.mean(bkg[S==0])))
def cen(img,r0=2.5):
    m=(r<=r0); wgt=np.clip(img,0,None)*m; return float((wgt*X).sum()/wgt.sum()),float((wgt*Y).sum()/wgt.sum())
for lab,img in [("median",med),("step",step),("dip (no step term)",dip0)]:
    cx,cy=cen(img); out[lab+" centroid offset arcsec"]=((cx-xt)*21,(cy-yt)*21); print(lab,"centroid offset arcsec",(cx-xt)*21,(cy-yt)*21)
# where is the step largest relative to the pixel flux, and in absolute e/s
jj,ii=np.unravel_index(np.argmax(step),step.shape); out["max_step_pixel"]=dict(x=int(ii),y=int(jj),dist_px=float(r[jj,ii]),step_e_s=float(step[jj,ii]),snr=float(step[jj,ii]/estep[jj,ii]),pix_flux=float(med[jj,ii]))
print("max step pixel",out["max_step_pixel"])
print("step map (e/s) around target:"); 
for j in range(int(yt)+4,int(yt)-5,-1): print(" ".join(f"{step[j,i]:6.1f}" for i in range(int(xt)-4,int(xt)+5)))
print("step SNR map:");
for j in range(int(yt)+4,int(yt)-5,-1): print(" ".join(f"{step[j,i]/estep[j,i]:6.1f}" for i in range(int(xt)-4,int(xt)+5)))
print("median flux map:");
for j in range(int(yt)+4,int(yt)-5,-1): print(" ".join(f"{med[j,i]:7.0f}" for i in range(int(xt)-4,int(xt)+5)))
# sum of significant step: total step flux vs fraction of target
tot=step[r<=3].sum(); out["step_total_r3_e_s"]=float(tot); out["step_frac_of_target_r3"]=float(tot/med[r<=3].sum())
ap_rows={}
for rap in [1.0,1.5,2.0,3.0]:
    ap=r<=rap; lc=Fb[:,ap].sum(1); y=lc/np.median(lc)
    c1=np.linalg.lstsq(M1,y,rcond=None)[0]; c0=np.linalg.lstsq(M0,y,rcond=None)[0]
    ap_rows[rap]=dict(npix=int(ap.sum()),step_ppt=round(c1[2]*1e3,2),dip_with_step_ppt=round(c1[3]*1e3,2),dip_quad_no_step_ppt=round(c0[3]*1e3,2),
                      sig_ppt=round(float(np.std(y-M1@c1)/np.sqrt((D<-0.5).sum())*1e3),2))
    print("r",rap,ap_rows[rap])
out["apertures"]=ap_rows
json.dump(out,open("data/step4_pixels.json","w"),indent=1,default=str)
fig,ax=plt.subplots(1,3,figsize=(16,5))
for a,img,ttl in zip(ax,[np.log10(np.clip(med,1,None)),step,dip0],["median (log e/s)","step at 2190.358 (e/s)","dip amplitude, quadratic baseline, no step term (e/s)"]):
    im=a.imshow(img,origin="lower"); plt.colorbar(im,ax=a,fraction=.046); a.set_title(ttl,fontsize=9)
    G=np.array(gaia["phot_g_mean_mag"]); b=G<18; a.scatter(gx[b],gy[b],s=np.clip((19-G[b])*12,5,200),facecolors='none',edgecolors='w',lw=.7); a.plot(xt,yt,'r+',ms=12,mew=2)
    a.set_xlim(xt-6,xt+6); a.set_ylim(yt-6,yt+6)
plt.tight_layout(); plt.savefig("figs/step4_pixels.png",dpi=100)
