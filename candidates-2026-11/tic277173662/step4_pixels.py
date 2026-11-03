"""S3 2-min TPF: (a) share of the SPOC-aperture flux from each Gaia star (Gaussian PSF of the width fitted to the image);
(b) deficit image at the S3 event and depth vs aperture; (c) a 3-source fit of the deficit image (target+HD 269859
blended at 0.26 px, R127 at 0.8 px, plus everything else) and its significance; (d) where the 0.3-1 d variability lives."""
import warnings; warnings.filterwarnings("ignore")
import glob, json, numpy as np, lightkurve as lk
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
from astropy.coordinates import SkyCoord; import astropy.units as u
from astropy.table import Table
from scipy.optimize import least_squares
from measure import measure
from common import RA, DEC, TC, DUR
gaia=Table.read("data/gaia_2arcmin.csv")
f=glob.glob("data/tpf/**/*s0003*tp.fits",recursive=True)[0]
tpf=lk.read(f); t=tpf.time.value; F=tpf.flux.value.astype(float); q=tpf.quality
g=(q==0)&np.all(np.isfinite(F),axis=(1,2)); t=t[g]; F=F[g]; ap=tpf.pipeline_mask; med=np.median(F,0)
Y,X=np.mgrid[:med.shape[0],:med.shape[1]]
gc=SkyCoord(gaia['ra'],gaia['dec'],unit='deg'); gx,gy=tpf.wcs.world_to_pixel(gc); G=np.ma.filled(gaia['phot_g_mean_mag'].astype(float),np.nan); G[G<5]=np.nan
xt,yt=[float(v) for v in tpf.wcs.world_to_pixel(SkyCoord(RA*u.deg,DEC*u.deg))]
ids={"target":4657655435693899904,"HD269859":4657655435693905408,"R127":4657655435693883776}
pos={k:(float(gx[gaia['source_id']==v][0]),float(gy[gaia['source_id']==v][0])) for k,v in ids.items()}
# PSF width from a Gaussian model of all Gaia stars G<17 fitted to the median image (free sigma, flux scale, bkg)
br=np.isfinite(G)&(G<17)
def model_img(sig,scale,bkg,sel=br):
    img=np.zeros_like(med)
    for x,y,m in zip(gx[sel],gy[sel],G[sel]):
        img+=10**(-0.4*(m-10))*np.exp(-((X-x)**2+(Y-y)**2)/(2*sig**2))/(2*np.pi*sig**2)
    return scale*img+bkg
sol=least_squares(lambda p:(model_img(*p)-med).ravel(),[0.9,1e4,100],bounds=([0.4,1,-1e4],[3,1e7,1e5]))
sig,scale,bkg=sol.x
out=dict(psf_sigma_px=round(sig,2),aperture_npix=int(ap.sum()),target_px=[round(xt,2),round(yt,2)],positions_px={k:[round(a,2),round(b,2)] for k,(a,b) in pos.items()})
shares=[]
tot=model_img(sig,scale,0)[ap].sum()
for i in np.where(br)[0]:
    one=np.zeros(len(G),bool); one[i]=True
    s=model_img(sig,scale,0,one)[ap].sum()/tot
    if s>0.005: shares.append(dict(source_id=int(gaia['source_id'][i]),G=round(float(G[i]),2),sep=round(float(gaia['sep'][i]),1),share=round(float(s),4)))
shares.sort(key=lambda d:-d['share']); out["aperture_flux_shares"]=shares[:10]
out["target_share_model"]=[s['share'] for s in shares if s['source_id']==ids['target']]
# (b) deficit and aperture growth
from measure import trapezoid
def pixdepth(c):
    w=np.abs(t-c)<1.0; tt=t[w]-c
    A=np.vstack([-trapezoid(t[w],c,DUR),np.ones_like(tt),tt,tt**2]).T
    if (A[:,0]<-0.5).sum()<100: return None
    co,*_=np.linalg.lstsq(A,F[w].reshape(w.sum(),-1),rcond=None); return co[0].reshape(med.shape)
D=pixdepth(TC)
sl=[pixdepth(c) for c in np.arange(t.min()+1,t.max()-1,0.25) if abs(c-TC)>1]
sl=np.array([x for x in sl if x is not None]); pix_sig=1.4826*np.median(np.abs(sl-np.median(sl,0)),0)
apser=sl[:,ap].sum(1); out_tmp_sig=1.4826*np.median(np.abs(apser-np.median(apser)))
out["deficit_ap_e_s"]=round(float(D[ap].sum()),1); out["deficit_ap_sig_e_s"]=round(float(out_tmp_sig),1); out["n_slid"]=len(sl); out["deficit_ap_frac_ppt"]=round(float(D[ap].sum()/med[ap].sum()*1e3),2)
rr=np.hypot(X-xt,Y-yt); grow=[]
for r_ in [1.0,1.5,2.0,3.0]:
    a=rr<=r_; m=measure(t,F[:,a].sum(1),TC,DUR,win=1.0)
    grow.append(dict(r=r_,npix=int(a.sum()),depth_ppt_of_aperture=round(m['depth']*1e3,2),sig=round(m['sig_adopt']*1e3,2)))
m=measure(t,F[:,ap].sum(1),TC,DUR,win=1.0); grow.append(dict(r="SPOC ap",npix=int(ap.sum()),depth_ppt_of_aperture=round(m['depth']*1e3,2),sig=round(m['sig_adopt']*1e3,2)))
out["aperture_growth"]=grow
# (c) fit the deficit with PSFs at the blend (target+HD269859) and R127
def psf(x,y): return np.exp(-((X-x)**2+(Y-y)**2)/(2*sig**2))/(2*np.pi*sig**2)
A=np.vstack([psf(*pos["target"]).ravel(),psf(*pos["R127"]).ravel(),np.ones(med.size)]).T
w=1/np.maximum(pix_sig.ravel(),1e-3)
c,*_=np.linalg.lstsq(A*w[:,None],D.ravel()*w,rcond=None); cov=np.linalg.pinv((A*w[:,None]).T@(A*w[:,None]))
out["deficit_fit_e_s"]=dict(target_blend=[round(c[0],1),round(float(np.sqrt(cov[0,0])),1)],R127=[round(c[1],1),round(float(np.sqrt(cov[1,1])),1)])
# expected deficit if the target alone dimmed by 31.8 ppt
ft=scale*10**(-0.4*(13.183-10)); out["expected_target_deficit_e_s_for_31.8ppt"]=round(float(ft*0.0318),1)
# (d) variability image: regression of each pixel's 1-h-binned, per-orbit-quadratic-detrended flux on the aperture LC
tb=np.arange(t.min(),t.max()+1/24,1/24); idx=np.digitize(t,tb); keep=[i for i in np.unique(idx) if (idx==i).sum()>15]
T=np.array([t[idx==i].mean() for i in keep]); FB=np.array([F[idx==i].mean(0) for i in keep])
orb=T>1396
def detr(y):
    r=y.copy()
    for o in [~orb,orb]:
        cc=np.polyfit(T[o]-T[o].mean(),y[o],2); r[o]=y[o]-np.polyval(cc,T[o]-T[o].mean())
    return r
tm=detr(FB[:,ap].sum(1)/np.median(FB[:,ap].sum(1)))
Av=np.array([[np.dot(detr(FB[:,i,j]),tm)/np.dot(tm,tm) for j in range(med.shape[1])] for i in range(med.shape[0])])
Bv=np.vstack([psf(*pos["target"]).ravel(),psf(*pos["R127"]).ravel(),np.ones(med.size)]).T
cv,*_=np.linalg.lstsq(Bv,Av.ravel(),rcond=None)
out["variability_fit_e_s_per_unit"]=dict(target_blend=round(cv[0],1),R127=round(cv[1],1))
out["variability_rms_ppt_of_aperture_1h"]=round(float(np.std(tm)*1e3),2)
print(json.dumps(out,indent=1)); json.dump(out,open("data/step4_pixels.json","w"),indent=1)
fig,ax=plt.subplots(1,4,figsize=(20,5))
ax[0].imshow(med,origin='lower'); ax[0].contour(ap,levels=[0.5],colors='w')
for k,(a,b) in pos.items(): ax[0].plot(a,b,'r+' if k=='target' else 'mx',ms=12); ax[0].text(a+0.3,b+0.3,k,color='w',fontsize=8)
ax[0].set_title("S3 median (+ target, x HD 269859 / R127)")
v=np.percentile(np.abs(D),99); ax[1].imshow(D,origin='lower',cmap='RdBu_r',vmin=-v,vmax=v); ax[1].contour(ap,levels=[0.5],colors='k'); ax[1].set_title("event deficit (baseline - in), e-/s")
ax[2].imshow(D/np.maximum(pix_sig,1e-3),origin='lower',cmap='RdBu_r',vmin=-4,vmax=4); ax[2].contour(ap,levels=[0.5],colors='k'); ax[2].set_title("deficit / per-pixel scatter of the same statistic")
v=np.percentile(np.abs(Av),99); ax[3].imshow(Av,origin='lower',cmap='RdBu_r',vmin=-v,vmax=v); ax[3].set_title("variability amplitude image")
for a in ax[1:]:
    for k,(x0,y0) in pos.items(): a.plot(x0,y0,'k+' if k=='target' else 'gx',ms=10)
fig.tight_layout(); fig.savefig("figs/step4_pixels.png",dpi=85)
