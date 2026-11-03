"""Difference image (out - in) for both deep events; Gaussian-PSF fit of the deficit's position vs Gaia sources;
required eclipse depth for every Gaia neighbour."""
import warnings; warnings.filterwarnings("ignore")
import glob, json, numpy as np, lightkurve as lk
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
from astropy.table import Table
from scipy.optimize import least_squares
from common import RA, DEC
EVS={31:2169.2210,67:3148.7519}
g=Table.read("data/gaia_2arcmin.csv"); G=np.array(g["phot_g_mean_mag"],float)
Gtot=-2.5*np.log10(np.sum(10**(-0.4*G[:2])))
def gauss(p,X,Y): a,x0,y0,s,b=p; return a*np.exp(-((X-x0)**2+(Y-y0)**2)/(2*s*s))+b
out={}
fig,axs=plt.subplots(2,3,figsize=(15,9))
for row,(s,tc) in zip(axs,EVS.items()):
    tpf=lk.read(glob.glob(f"data/tesscut/**/tess-s{s:04d}*.fits",recursive=True)[0])
    t=tpf.time.value; F=tpf.flux.value.astype(float); good=(tpf.quality==0)&np.all(np.isfinite(F),axis=(1,2))
    med=np.nanmedian(F[good],0); F=F-np.nanmedian(F[:,med<np.nanpercentile(med,40)],1)[:,None,None]
    inn=good&(np.abs(t-tc)<0.6/24*1.5)
    oot=good&(np.abs(t-tc)>0.2)&(np.abs(t-tc)<0.6)
    Iin=np.nanmean(F[inn],0); Iout=np.nanmean(F[oot],0); D=Iout-Iin
    # noise per pixel of D
    sl=[]
    for o in np.r_[np.arange(-2.0,-0.7,0.15),np.arange(0.7,2.0,0.15)]:
        i2=good&(np.abs(t-tc-o)<0.6/24*1.5); o2=good&(np.abs(t-tc-o)>0.2)&(np.abs(t-tc-o)<0.6)
        if i2.sum()>2 and o2.sum()>10: sl.append(np.nanmean(F[o2],0)-np.nanmean(F[i2],0))
    E=np.nanstd(np.array(sl),0)
    gx,gy=tpf.wcs.world_to_pixel_values(np.array(g["ra"]),np.array(g["dec"]))
    xt,yt=(gx[0]+gx[1])/2,(gy[0]+gy[1])/2
    ny,nx=D.shape; Y,X=np.mgrid[:ny,:nx]
    box=np.hypot(X-xt,Y-yt)<5
    fitI=least_squares(lambda p:((gauss(p,X,Y)-Iout)/np.sqrt(np.abs(Iout)+50))[box],[Iout[int(yt),int(xt)],xt,yt,0.8,0]).x
    fitD=least_squares(lambda p:((gauss(p,X,Y)-D)/np.where(E>0,E,1))[box],[D[int(yt),int(xt)],xt,yt,fitI[3],0])
    J=fitD.jac; cov=np.linalg.pinv(J.T@J)*np.sum(fitD.fun**2)/(box.sum()-5)
    pxscale=21.0
    dx,dy=fitD.x[1]-fitI[1],fitD.x[2]-fitI[2]; ex,ey=np.sqrt(cov[1,1]),np.sqrt(cov[2,2])
    # offset of deficit relative to the out-of-eclipse star image (removes WCS/PSF-centroid systematics)
    nb=[]
    for i in range(len(g)):
        sep=np.hypot(gx[i]-gx[0],gy[i]-gy[0])*pxscale
        if sep>90 or G[i]-Gtot>8: continue
        # position of the deficit expected if that source were eclipsed, in out-image frame
        ox,oy=fitI[1]+(gx[i]-xt),fitI[2]+(gy[i]-yt)
        chi=np.hypot((fitD.x[1]-ox)/ex,(fitD.x[2]-oy)/ey)
        need=0.0578/10**(-0.4*(G[i]-Gtot))   # 57.8 ppt = r=1.0 px own-phot depth (closest to undiluted)
        nb.append(dict(source_id=int(g["source_id"][i]),sep_arcsec=round(float(sep),1),G=round(float(G[i]),2),needed_eclipse=round(float(need),3),
                       offset_sigma=round(float(chi),1)))
    out[s]=dict(deficit_total_e=float(np.nansum(D[box])),star_total_e=float(np.nansum(Iout[box])),ratio_ppt=float(np.nansum(D[box])/np.nansum(Iout[box])*1e3),
                deficit_minus_star_px=[round(dx,3),round(dy,3)],err_px=[round(ex,3),round(ey,3)],offset_arcsec=round(float(np.hypot(dx,dy)*pxscale),2),
                offset_err_arcsec=round(float(np.hypot(ex,ey)*pxscale),2),psf_sigma_star=round(fitI[3],3),psf_sigma_deficit=round(fitD.x[3],3),
                peak_snr=float(np.nanmax(D/E)),neighbours=nb)
    print(json.dumps({k:v for k,v in out[s].items() if k!="neighbours"}))
    for n in nb[:12]: print("  ",n)
    for a,img,ttl in zip(row,[np.log10(np.clip(Iout,1,None)),D,D/E],[f"S{s} out-of-eclipse (log e/s)","out - in (e/s)","(out - in)/sigma"]):
        im=a.imshow(img,origin="lower",cmap="viridis" if a is row[0] else "RdBu_r"); plt.colorbar(im,ax=a,fraction=.046); a.set_title(ttl,fontsize=9)
        b=G<19; a.scatter(gx[b],gy[b],s=np.clip((20-G[b])*10,5,200),facecolors="none",edgecolors="w" if a is row[0] else "k",lw=.7)
        a.plot(fitD.x[1]-(fitI[1]-xt),fitD.x[2]-(fitI[2]-yt),"rx",ms=10,mew=2); a.set_xlim(-.5,nx-.5); a.set_ylim(-.5,ny-.5)
fig.suptitle("Difference images; red x = deficit position (Gaussian fit, referenced to the star image); circles = Gaia DR3 G<19")
fig.tight_layout(); fig.savefig("figs/diffimage.png",dpi=100)
json.dump(out,open("data/step4_diffimage.json","w"),indent=1)
