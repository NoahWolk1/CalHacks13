"""Free-position PSF fit of the per-pixel depth image: chi2 map over source position (amp + flat free at each),
Gaussian PSF sigma from step4_locate. Also an injection test: inject a 3.96 ppt on-target dip (target PSF) into the cube and rerun."""
import warnings; warnings.filterwarnings("ignore")
import glob, json, numpy as np, lightkurve as lk
from astropy.table import Table
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
from measure import trapezoid
from common import TC, DUR
L=json.load(open("data/step4_locate.json")); s=L['psf_sigma']; dx,dy=L['wcs_offset']
tpf=lk.read(glob.glob("data/tesscut/tesscut/tess-s0039*.fits")[0])
t=tpf.time.value; F=tpf.flux.value.astype(float); fin=np.all(np.isfinite(F),axis=(1,2))
g=Table.read("data/gaia_2arcmin.csv"); gx,gy=tpf.wcs.world_to_pixel_values(np.array(g["ra"]),np.array(g["dec"])); gx=gx+dx; gy=gy+dy
Y,X=np.mgrid[:F.shape[1],:F.shape[2]]
med=np.nanmedian(F[fin],0); faint=(med<np.nanpercentile(med,40))&(np.hypot(X-gx[0],Y-gy[0])>3)
bkg=np.nanmedian(F[:,faint],1); Fb=F-bkg[:,None,None]
w=(np.abs(t-TC)<1)&fin; tt=t[w]; sh=trapezoid(tt,TC,DUR); A=np.vstack([-sh,np.ones_like(tt),tt-TC,(tt-TC)**2]).T
P=np.linalg.pinv(A)
def dimg(cube):
    C=cube[w].reshape(w.sum(),-1); coef=P@C; r=C-A@coef
    D=coef[0].reshape(med.shape); E=np.sqrt(np.linalg.pinv(A.T@A)[0,0]*r.var(0)).reshape(med.shape); return D,E
box=(np.abs(X-gx[0])<=3.5)&(np.abs(Y-gy[0])<=3.5)
def psf(x0,y0): return np.exp(-((X-x0)**2+(Y-y0)**2)/(2*s*s))/(2*np.pi*s*s)
def chimap(D,E):
    xs=np.arange(gx[0]-3,gx[0]+3.01,0.1); ys=np.arange(gy[0]-3,gy[0]+3.01,0.1); C=np.zeros((len(ys),len(xs))); Amp=np.zeros_like(C)
    wt=1/E[box]
    for i,y0 in enumerate(ys):
        for j,x0 in enumerate(xs):
            M=np.vstack([psf(x0,y0)[box],np.ones(box.sum())]).T*wt[:,None]
            c,*_=np.linalg.lstsq(M,D[box]*wt,rcond=None); C[i,j]=np.sum((D[box]*wt-M@c)**2); Amp[i,j]=c[0]
    k=np.unravel_index(np.argmin(C),C.shape); return xs,ys,C,Amp,(xs[k[1]],ys[k[0]],C[k],Amp[k])
out={}
D,E=dimg(Fb)
xs,ys,C,Amp,best=chimap(D,E)
def at(x0,y0): return float(C[np.argmin(np.abs(ys-y0)),np.argmin(np.abs(xs-x0))])
out['real']=dict(best_x=float(best[0]),best_y=float(best[1]),chi2_min=float(best[2]),amp_e=float(best[3]),
     offset_from_target_px=float(np.hypot(best[0]-gx[0],best[1]-gy[0])),offset_from_nbr_px=float(np.hypot(best[0]-gx[1],best[1]-gy[1])),
     dchi2_target=at(gx[0],gy[0])-float(best[2]),dchi2_nbr=at(gx[1],gy[1])-float(best[2]),
     target_xy=[float(gx[0]),float(gy[0])],nbr_xy=[float(gx[1]),float(gy[1])],nbr_sep_px=float(np.hypot(gx[1]-gx[0],gy[1]-gy[0])))
print(out['real'])
# 1-sigma region area (dchi2<2.3)
out['real']['n_grid_dchi2_lt_2.3']=int((C-best[2]<2.3).sum())
# injection: target-PSF dip of 3.96 ppt of target flux (target flux from locate fit), shape = trapezoid
ft=1218.6
inj=Fb.copy(); inj-= (0.00396*ft*psf(gx[0],gy[0]))[None]*trapezoid(t,TC,DUR)[:,None,None]
Di,Ei=dimg(inj); _,_,Ci,Ampi,bi=chimap(Di,Ei)
out['injected_on_target_3.96ppt']=dict(best_x=float(bi[0]),best_y=float(bi[1]),amp_e=float(bi[3]),offset_from_target_px=float(np.hypot(bi[0]-gx[0],bi[1]-gy[0])))
print(out['injected_on_target_3.96ppt'])
# injection into a time window with no event (shift by +3 d) to test recovery of position at this SNR
for sh_ in [-0.8, 3.0, 5.0]:
    tc2=TC+sh_; w2=(np.abs(t-tc2)<1)&fin
    if w2.sum()<50: continue
    inj=Fb.copy(); inj-= (0.00396*ft*psf(gx[0],gy[0]))[None]*trapezoid(t,tc2,DUR)[:,None,None]
    tt2=t[w2]; A2=np.vstack([-trapezoid(tt2,tc2,DUR),np.ones_like(tt2),tt2-tc2,(tt2-tc2)**2]).T; P2=np.linalg.pinv(A2)
    Cc=inj[w2].reshape(w2.sum(),-1); co=P2@Cc; rr=Cc-A2@co
    D2=co[0].reshape(med.shape); E2=np.sqrt(np.linalg.pinv(A2.T@A2)[0,0]*rr.var(0)).reshape(med.shape)
    _,_,_,_,b2=chimap(D2,E2)
    out[f'inject_at_{tc2:.2f}']=dict(best_x=float(b2[0]),best_y=float(b2[1]),amp_e=float(b2[3]),offset_from_target_px=float(np.hypot(b2[0]-gx[0],b2[1]-gy[0])),
          target_px_depth_ppt=float(D2[int(round(gy[0])),int(round(gx[0]))]/med[int(round(gy[0])),int(round(gx[0]))]*1e3) if False else None)
    print(tc2,out[f'inject_at_{tc2:.2f}'])
json.dump(out,open("data/step4_posfit.json","w"),indent=1)
fig,ax=plt.subplots(1,2,figsize=(12,5))
ax[0].imshow(D,origin='lower',cmap='RdBu_r',vmin=-0.8,vmax=0.8); ax[0].set_title('per-pixel depth (e/s), S39 event')
ax[1].contourf(xs,ys,C-best[2],levels=[0,2.3,6.2,11.8,25,50],cmap='viridis_r'); ax[1].set_title('Δχ² of single-PSF position (+flat)')
for a in ax:
    b=np.array(g['phot_g_mean_mag'])<18.5
    a.scatter(gx[b],gy[b],s=np.clip((19-np.array(g['phot_g_mean_mag'])[b])*15,5,200),facecolors='none',edgecolors='k')
    a.plot(gx[0],gy[0],'r+',ms=14,mew=2); a.plot(best[0],best[1],'mx',ms=12,mew=2)
    a.set_xlim(gx[0]-3.5,gx[0]+3.5); a.set_ylim(gy[0]-3.5,gy[0]+3.5)
fig.tight_layout(); fig.savefig('figs/step4_posfit.png',dpi=100)
