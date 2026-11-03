"""Localisation: fit the per-pixel depth image D (from step2_own_phot logic) with Gaussian-PSF templates centred on
Gaia sources (target, the G=15.9 neighbour at 32", others) + a flat background-error term. Uses PSF width fitted on the median image."""
import warnings; warnings.filterwarnings("ignore")
import glob, json, numpy as np, lightkurve as lk
from astropy.table import Table
from scipy.optimize import least_squares
from measure import trapezoid
from common import TC, DUR
tpf=lk.read(glob.glob("data/tesscut/tesscut/tess-s0039*.fits")[0])
t=tpf.time.value; F=tpf.flux.value.astype(float); fin=np.all(np.isfinite(F),axis=(1,2))
g=Table.read("data/gaia_2arcmin.csv")
gx,gy=tpf.wcs.world_to_pixel_values(np.array(g["ra"]),np.array(g["dec"])); G=np.array(g['phot_g_mean_mag'])
med=np.nanmedian(F[fin],0); Y,X=np.mgrid[:F.shape[1],:F.shape[2]]
faint=(med<np.nanpercentile(med,40))&(np.hypot(X-gx[0],Y-gy[0])>3)
bkg=np.nanmedian(F[:,faint],1); Fb=F-bkg[:,None,None]; medb=np.nanmedian(Fb[fin],0)
box=(np.abs(X-gx[0])<=3.5)&(np.abs(Y-gy[0])<=3.5)
src=[i for i in range(len(g)) if G[i]<18.5 and abs(gx[i]-gx[0])<5 and abs(gy[i]-gy[0])<5]
def psf(x0,y0,s): return np.exp(-((X-x0)**2+(Y-y0)**2)/(2*s*s))/(2*np.pi*s*s)
# fit median image: fluxes free, common sigma and common offset dx,dy (WCS error)
def mres(p):
    s,dx,dy,c=p[:4]; fl=p[4:]
    m=c+sum(f*psf(gx[i]+dx,gy[i]+dy,s) for f,i in zip(fl,src)); return (m-medb)[box]
p0=[0.8,0,0,0]+[med.max()*10**(-0.4*(G[i]-G[0])) for i in src]
fit=least_squares(mres,p0); s,dx,dy=fit.x[:3]
fl=fit.x[4:]
print("psf sigma",s,"offset",dx,dy,"fluxes",dict(zip([int(g['source_id'][i]) for i in src],np.round(fl,1))))
# per-pixel depth image
w=(np.abs(t-TC)<1)&fin; tt=t[w]; sh=trapezoid(tt,TC,DUR)
A=np.vstack([-sh,np.ones_like(tt),tt-TC,(tt-TC)**2]).T
ny,nx=med.shape; D=np.zeros((ny,nx)); E=np.zeros((ny,nx))
for yy in range(ny):
    for xx in range(nx):
        v=Fb[w,yy,xx]; c,*_=np.linalg.lstsq(A,v,rcond=None); r=v-A@c
        D[yy,xx]=c[0]; E[yy,xx]=np.sqrt(np.linalg.pinv(A.T@A)[0,0]*np.var(r))
out=dict(psf_sigma=float(s),wcs_offset=[float(dx),float(dy)],sources=[])
print("D/E 7x7 around target (rows=y):"); i0,j0=int(round(gy[0])),int(round(gx[0]))
print(np.round((D/E)[i0-3:i0+4,j0-3:j0+4],1)); print("D e/s:"); print(np.round(D[i0-3:i0+4,j0-3:j0+4],2))
out["D_over_E_7x7"]=np.round((D/E)[i0-3:i0+4,j0-3:j0+4],2).tolist()
# single-source + flat models; chi2 for each candidate source
wts=1/E[box]**2
res=[]
for k,i in enumerate(src):
    T_=psf(gx[i]+dx,gy[i]+dy,s)[box]
    for flat in [False,True]:
        M=np.vstack([T_]+([np.ones(box.sum())] if flat else [])).T
        Aw=M*np.sqrt(wts)[:,None]; bw=D[box]*np.sqrt(wts)
        c,*_=np.linalg.lstsq(Aw,bw,rcond=None); chi=np.sum((bw-Aw@c)**2)
        cov=np.linalg.pinv(Aw.T@Aw)
        res.append(dict(source=int(g['source_id'][i]),G=float(G[i]),sep=float(g['sep'][i]),flat=flat,amp_e=float(c[0]),amp_err=float(np.sqrt(cov[0,0])),
                        frac_depth_of_source=float(c[0]/fl[k]) if fl[k]>0 else None,frac_err=float(np.sqrt(cov[0,0])/fl[k]) if fl[k]>0 else None,
                        flat_e=float(c[1]) if flat else None, chi2=float(chi)))
chi0=float(np.sum(D[box]**2*wts)); out['chi2_null']=chi0; out['npix']=int(box.sum())
out['fits']=res
for r_ in res: print(r_)
print("chi2 null",chi0,"npix",box.sum())
# flat-only
M=np.ones(box.sum()); c=np.sum(D[box]*wts)/np.sum(wts); out['flat_only']=dict(amp=float(c),err=float(1/np.sqrt(np.sum(wts))),chi2=float(np.sum((D[box]-c)**2*wts)))
print("flat only",out['flat_only'])
# needed depths for each Gaia neighbour (aperture dilution approx by G flux)
json.dump(out,open("data/step4_locate.json","w"),indent=1)
