"""TESScut S65/S97: own photometry at several apertures (2 backgrounds), flare amplitude vs aperture, difference images
(flare peak minus pre-flare; 'dip' window minus a flare+baseline per-pixel model), centroid of each vs Gaia, other stars in the cutout."""
import warnings; warnings.filterwarnings("ignore")
import glob, json, numpy as np, lightkurve as lk
from astropy.table import Table
from scipy.optimize import least_squares
from measure import trapezoid, fit_depth
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
def flare(t,tp,fwhm,amp):
    x=(t-tp)/fwhm; f=np.zeros_like(t)
    r=(x>-1)&(x<=0); f[r]=1+1.941*x[r]-0.175*x[r]**2-2.246*x[r]**3-1.125*x[r]**4
    d=x>0; f[d]=0.6890*np.exp(-1.600*x[d])+0.3030*np.exp(-0.2783*x[d])
    return amp*f
FM=json.load(open("data/step2_flaremodel.json"))
EV={65:(3084.74,"tess-s0065"),97:(3979.76,"tess-s0097")}
g=Table.read("data/gaia_2arcmin.csv")
out={}
fig,axs=plt.subplots(2,4,figsize=(20,9))
for k,(sec,(tc,pat)) in enumerate(EV.items()):
    tpf=lk.read(glob.glob(f"data/tesscut/**/{pat}*.fits",recursive=True)[0])
    t=tpf.time.value; F=tpf.flux.value.astype(float); q=tpf.quality
    ok=np.all(np.isfinite(F),axis=(1,2))&(q==0)&(np.abs(t-tc)<1.5); t=t[ok]; F=F[ok]
    med=np.nanmedian(F,0); ny,nx=med.shape; Y,X=np.mgrid[:ny,:nx]
    gx,gy=tpf.wcs.world_to_pixel_values(np.array(g["ra"]),np.array(g["dec"])); x0,y0=gx[0],gy[0]
    bmask=(med<np.nanpercentile(med,30))&(np.hypot(X-x0,Y-y0)>5)
    bkg_med=np.nanmedian(F[:,bmask],1)
    # column-wise local background (rows/cols around the target excluding r<4)
    bmask2=(np.hypot(X-x0,Y-y0)>4)&(np.hypot(X-x0,Y-y0)<8)&(med<np.nanpercentile(med[(np.hypot(X-x0,Y-y0)>4)&(np.hypot(X-x0,Y-y0)<8)],50))
    bkg_ann=np.nanmedian(F[:,bmask2],1)
    p=np.array(FM[f"S{sec}"]["nodip"]["p"]); npoly=4; nfl=(len(p)-npoly)//3
    res={}
    for bl,bk in [("bkg_global",bkg_med),("bkg_annulus",bkg_ann)]:
        Fb=F-bk[:,None,None]
        for rad in [1.0,1.5,2.0,2.5,3.0,4.0]:
            ap=np.hypot(X-x0,Y-y0)<=rad; y=Fb[:,ap].sum(1); y=y/np.nanmedian(y); t0=t.mean()
            m=fit_depth(t,y,tc,0.25,0.75,2)
            def model(pp,dip=True):
                mm=sum(pp[i]*(t-t0)**i for i in range(npoly))
                for j in range(nfl): mm=mm+flare(t,pp[npoly+3*j],abs(pp[npoly+3*j+1]),pp[npoly+3*j+2])
                return mm-(pp[-1]*trapezoid(t,tc,0.25) if dip else 0)
            pp0=np.r_[p,0.0]; pp0[0]=1
            s=least_squares(lambda pp:model(pp)-y,pp0)
            J=s.jac; sw=np.sqrt(np.linalg.pinv(J.T@J)[-1,-1]*np.var(s.fun))
            fa=[float(s.x[npoly+3*j+2]) for j in range(nfl)]
            res[f"{bl}_r{rad}"]=dict(raw_localquad_ppt=float(m["depth"]*1e3),flaremodel_dip_ppt=float(s.x[-1]*1e3),sig_white_ppt=float(sw*1e3),flare_amp_frac=fa,npix=int(ap.sum()))
            print(sec,bl,rad,{kk:(np.round(v,4) if not isinstance(v,list) else [round(a,4) for a in v]) for kk,v in res[f"{bl}_r{rad}"].items()})
    # difference images
    Fb=F-bkg_med[:,None,None]
    tp=p[npoly]  # first flare peak
    pre=(t>tp-0.6)&(t<tp-0.15); peak=np.abs(t-tp)<0.05
    D_fl=np.nanmean(Fb[pre],0)-np.nanmean(Fb[peak],0)   # negative where flux rose
    # per-pixel: baseline (cubic) + flare shape fixed from the LC fit (free amplitude) + dip at tc (free)
    fsh=sum(flare(t,p[npoly+3*j],abs(p[npoly+3*j+1]),p[npoly+3*j+2]) for j in range(nfl))
    A=np.column_stack([((t-t.mean()))**i for i in range(4)]+[fsh,-trapezoid(t,tc,0.25)])
    Ai=np.linalg.pinv(A); C=np.einsum('ij,jyx->iyx',Ai,Fb)
    Famp=C[4]; Dip=C[5]; resid=Fb-np.einsum('ij,jyx->iyx',A,C); Derr=np.sqrt(np.linalg.pinv(A.T@A)[5,5]*np.var(resid,0))
    def cen(img,r0=2.5):
        m=np.hypot(X-x0,Y-y0)<=r0; w=np.clip(img,0,None)*m; return float((w*X).sum()/w.sum()),float((w*Y).sum()/w.sum())
    cmed=cen(med-np.median(bkg_med)); cfl=cen(Famp)
    ap=np.hypot(X-x0,Y-y0)<=2.0
    out[f"S{sec}"]=dict(phot=res,gaia_xy=[float(x0),float(y0)],centroid_median=cmed,centroid_flare=cfl,
        flare_offset_arcsec=[(cfl[0]-cmed[0])*21,(cfl[1]-cmed[1])*21],
        flare_frac_r2=float(Famp[ap].sum()/med[ap].sum()) if True else None,
        dip_r2_ppt=float(Dip[ap].sum()/(med-np.median(bkg_med))[ap].sum()*1e3), dip_r2_snr=float(Dip[ap].sum()/np.sqrt((Derr[ap]**2).sum())),
        peak_pixel_flare=[int(v) for v in np.unravel_index(np.argmax(Famp),Famp.shape)][::-1])
    print(sec,"centroid median",cmed,"flare",cfl,"offset arcsec",out[f"S{sec}"]["flare_offset_arcsec"],"dip in r2 per-pixel:",out[f"S{sec}"]["dip_r2_ppt"],"snr",out[f"S{sec}"]["dip_r2_snr"])
    for a,img,ttl in zip(axs[k],[np.log10(np.clip(med-np.median(bkg_med),1,None)),-D_fl,Famp,Dip/np.where(Derr>0,Derr,np.nan)],
                         ["median (log)","flare peak minus pre-flare (e/s)","flare amplitude, per-pixel fit","dip at TC / sigma, per-pixel fit (flare modelled)"]):
        im=a.imshow(img,origin='lower'); plt.colorbar(im,ax=a,fraction=.046); a.set_title(f"S{sec} {ttl}",fontsize=9)
        b=np.array(g["phot_g_mean_mag"])<17.5; a.scatter(gx[b],gy[b],s=20,facecolors='none',edgecolors='w'); a.plot(x0,y0,'r+',ms=12,mew=2)
        a.set_xlim(x0-7,x0+7); a.set_ylim(y0-7,y0+7)
    # other stars in cutout: bright Gaia sources > 3 px away, same flare-window statistic
    oth=[]
    for i in range(len(g)):
        if g["phot_g_mean_mag"][i]>15.5 or np.hypot(gx[i]-x0,gy[i]-y0)<3: continue
        if not (2<gx[i]<nx-3 and 2<gy[i]<ny-3): continue
        ap2=np.hypot(X-gx[i],Y-gy[i])<=1.5; y2=Fb[:,ap2].sum(1); y2=y2/np.nanmedian(y2)
        s2=np.linalg.lstsq(A,y2,rcond=None)[0]
        oth.append(dict(source_id=int(g["source_id"][i]),G=float(g["phot_g_mean_mag"][i]),sep_px=float(np.hypot(gx[i]-x0,gy[i]-y0)),flare_shape_amp=float(s2[4]),dip_ppt=float(s2[5]*1e3)))
    out[f"S{sec}"]["other_stars"]=oth
    for o in oth: print("   other",o)
plt.tight_layout(); plt.savefig("figs/step4_pixels.png",dpi=90)
json.dump(out,open("data/step4_pixels.json","w"),indent=1)
