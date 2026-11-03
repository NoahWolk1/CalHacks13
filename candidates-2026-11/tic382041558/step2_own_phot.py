"""Own TESScut (S39, 21x21) photometry: apertures r=1..3 px x 4 background estimators; q==0 and all-finite.
Plus per-pixel depth image (difference image) and the dip each Gaia neighbour would need."""
import warnings; warnings.filterwarnings("ignore")
import glob, json, numpy as np, lightkurve as lk
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
from astropy.coordinates import SkyCoord; import astropy.units as u
from astropy.stats import sigma_clipped_stats
from astropy.table import Table
from measure import measure, trapezoid
from common import RA, DEC, TC, DUR
tpf=lk.read(glob.glob("data/tesscut/tesscut/tess-s0039*.fits")[0])
t=tpf.time.value; F=tpf.flux.value.astype(float); q=tpf.quality
fin=np.all(np.isfinite(F),axis=(1,2))
ev=np.abs(t-TC)<DUR/2
out={"tesscut_quality_in_event":{int(v):int((q[ev]==v).sum()) for v in np.unique(q[ev])}}
print(out)
xt,yt=[float(v) for v in tpf.wcs.world_to_pixel(SkyCoord(RA*u.deg,DEC*u.deg))]
Y,X=np.mgrid[:F.shape[1],:F.shape[2]]; r=np.hypot(X-xt,Y-yt)
med=np.nanmedian(F[fin],0)
faint=(med<np.nanpercentile(med,40))&(r>3)
bk={}
bk["global faint-40%"]=np.nanmedian(F[:,faint],1)
ann=(r>4)&(r<8)
bk["annulus 4-8 clipped"]=np.array([sigma_clipped_stats(f[ann])[1] if np.all(np.isfinite(f[ann])) else np.nan for f in F])
bk["annulus 4-8 25pct"]=np.nanpercentile(F[:,ann],25,axis=1)
A=np.vstack([np.ones(faint.sum()),X[faint],Y[faint]]).T
co=np.linalg.lstsq(A,np.nan_to_num(F[:,faint]).T,rcond=None)[0]; bk["plane fit"]=co[0]+co[1]*xt+co[2]*yt
out["bkg_gradient_e_per_px"]={"x_med_out":None}
w1=np.abs(t-TC)<1
out["plane_grad_x_y_in_event"]=[float(np.nanmean(co[1][ev])),float(np.nanmean(co[2][ev]))]
out["plane_grad_x_y_out"]=[float(np.nanmean(co[1][w1&~ev])),float(np.nanmean(co[2][w1&~ev]))]
res={}; LC={}
for name,b in bk.items():
    for rap in [1.0,1.5,2.0,2.5,3.0]:
        ap=r<=rap; lc=np.nansum(F[:,ap]-b[:,None],1); LC[(name,rap)]=lc
        for qm,gm in [("q==0",(q==0)&fin),("all finite",fin)]:
            y=lc.copy(); y[~gm]=np.nan; g=np.isfinite(y)
            m=measure(t[g],y[g],TC,DUR,1.0)
            key=f"{name}, r={rap}, {qm}"
            if m is None or not np.isfinite(m.get("depth",np.nan)): res[key]=None; continue
            res[key]=dict(depth=round(m['depth']*1e3,2),sig=round(m['sig_adopt']*1e3,2),cov=round(m['cov'],2),frac_deeper=round(float(m['frac_deeper']),3),npix=int(ap.sum()))
            print(f"{key:40s} {res[key]}",flush=True)
out["phot"]=res
ap=r<=1.5; star=np.nanmedian(np.nansum(F[fin][:,ap]-bk["global faint-40%"][fin][:,None],1))
out["star_e_s_r1.5"]=float(star); out["bkg_per_px_median"]=float(np.nanmedian(bk["global faint-40%"][fin]))
out["bkg_per_px_in_event"]=float(np.nanmedian(bk["global faint-40%"][ev&fin]))
# difference image: per-pixel box depth, quadratic baseline, +-1 d
Fb=F-bk["global faint-40%"][:,None,None]
w=w1&fin; tt=t[w]; s=trapezoid(tt,TC,DUR)
Am=np.vstack([-s,np.ones_like(tt),tt-TC,(tt-TC)**2]).T
ny,nx=med.shape; D=np.zeros((ny,nx)); E=np.zeros((ny,nx))
for yy in range(ny):
    for xx in range(nx):
        v=Fb[w,yy,xx]; c,*_=np.linalg.lstsq(Am,v,rcond=None); rr=v-Am@c
        D[yy,xx]=c[0]; E[yy,xx]=np.sqrt(np.linalg.pinv(Am.T@Am)[0,0]*np.var(rr))
medb=np.nanmedian(Fb[fin],0)
exp=0.00396*medb
# PSF-template fit: D = a * medb(target-centred region) ; compare chi2 of target model vs shifted
core=r<=2.5
out["diff_sum_r2.5_e"]=float(D[core].sum()); out["diff_sum_r2.5_ppt"]=float(D[core].sum()/medb[core].sum()*1e3)
out["diff_target_px"]=dict(D=float(D[int(round(yt)),int(round(xt))]),E=float(E[int(round(yt)),int(round(xt))]),expected=float(exp[int(round(yt)),int(round(xt))]))
a=np.sum(D[core]*medb[core]/E[core]**2)/np.sum(medb[core]**2/E[core]**2); ea=1/np.sqrt(np.sum(medb[core]**2/E[core]**2))
out["diff_scaled_to_image_ppt"]=[float(a*1e3),float(ea*1e3)]
g=Table.read("data/gaia_2arcmin.csv")
gx,gy=tpf.wcs.world_to_pixel_values(np.array(g["ra"]),np.array(g["dec"]))
print(json.dumps({k:v for k,v in out.items() if k!='phot'},indent=1))
json.dump(out,open("data/step2_own_phot.json","w"),indent=1,default=float)
fig,ax=plt.subplots(1,4,figsize=(19,4.6))
vm=1.5*np.nanmax(exp)
for a_,img,ttl in zip(ax,[np.log10(np.clip(medb,1,None)),D,exp,D/E],["median (log e/s), Gaia G<18","per-pixel depth (e/s)","expected if target dims 3.96 ppt","per-pixel depth S/N"]):
    if a_ is ax[0]: im=a_.imshow(img,origin='lower')
    elif a_ is ax[3]: im=a_.imshow(img,origin='lower',cmap='RdBu_r',vmin=-4,vmax=4)
    else: im=a_.imshow(img,origin='lower',cmap='RdBu_r',vmin=-vm,vmax=vm)
    plt.colorbar(im,ax=a_,fraction=.046); a_.set_title(ttl,fontsize=9)
    b=np.array(g["phot_g_mean_mag"])<18
    a_.scatter(gx[b],gy[b],s=np.clip((19-np.array(g['phot_g_mean_mag'])[b])*12,5,200),facecolors='none',edgecolors='k',lw=.7); a_.plot(xt,yt,'r+',ms=12,mew=2)
fig.tight_layout(); fig.savefig("figs/step4_diffimage_s39.png",dpi=100)
fig,ax=plt.subplots(2,1,figsize=(11,7),sharex=True); wz=np.abs(t-TC)<2.5
for k,(name,rap) in enumerate([("global faint-40%",1.0),("global faint-40%",2.0),("global faint-40%",3.0),("annulus 4-8 clipped",2.0)]):
    lc=LC[(name,rap)]; gg=fin&wz; y=(lc[gg]/np.nanmedian(lc[gg])-1)*1e3; tt2=t[gg]
    tb=np.arange(TC-2.5,TC+2.5,1/24); i=np.digitize(tt2,tb); u_=[kk for kk in range(1,len(tb)) if (i==kk).sum()]
    ax[0].plot([tb[kk-1]+1/48 for kk in u_],[np.mean(y[i==kk])-10*k for kk in u_],'.-',ms=3,label=f"{name} r={rap}")
ax[0].legend(fontsize=7); ax[0].set_ylabel('ppt, 1h bins (offset)')
ax[1].plot(t[wz],bk["global faint-40%"][wz],'k.',ms=2); ax[1].set_ylabel('bkg e/s/px')
for a_ in ax: a_.axvspan(TC-DUR/2,TC+DUR/2,color='orange',alpha=.25)
fig.tight_layout(); fig.savefig("figs/step2_own_phot_s39.png",dpi=100)
