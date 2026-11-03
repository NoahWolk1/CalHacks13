"""S7: time series of the pixel that steps at 1492.85 (row 12, col 10) and its neighbours; photometry with that pixel masked;
per-pixel step significance map."""
import warnings; warnings.filterwarnings("ignore")
import glob, json, numpy as np, lightkurve as lk
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
from astropy.coordinates import SkyCoord; import astropy.units as u
from measure import measure
from common import RA, DEC, TC, DUR
f=glob.glob("data/tesscut/**/*s0007*.fits",recursive=True)[0]
tpf=lk.read(f); t=tpf.time.value; F=tpf.flux.value.astype(float)
xt,yt=[float(v) for v in tpf.wcs.world_to_pixel(SkyCoord(RA*u.deg,DEC*u.deg))]
Y,X=np.mgrid[:21,:21]; rr=np.hypot(X-xt,Y-yt); ann=(rr>5)&(rr<8)
bk=np.array([np.median(np.sort(fr[ann])[:int(ann.sum()*0.7)]) for fr in F])
Fb=F-bk[:,None,None]
out=dict(target_px=[xt,yt])
fig,ax=plt.subplots(3,1,figsize=(12,10))
w=(t>1491.9)&(t<1494.5)
for (i,j) in [(12,10),(11,10),(12,9),(11,9),(13,10),(12,11),(10,10)]:
    y=Fb[:,i,j]; pre=(t>1492.0)&(t<1492.84); post=(t>1492.9)&(t<1493.7); ev=np.abs(t-TC)<DUR/2
    d=dict(med=round(float(np.median(Fb[:,i,j])),1),pre=round(float(np.median(y[pre])),1),event=round(float(np.median(y[ev])),1),post=round(float(np.median(y[post])),1),
           late=round(float(np.median(y[(t>1500)&(t<1503)])),1), end=round(float(np.median(y[t>1512])),1), dist=round(float(rr[i,j]),2))
    out[f"px_r{i}c{j}"]=d; print((i,j),d)
    ax[0 if (i,j)==(12,10) else 1].plot(t[w],y[w]-np.median(y[w]),'.-',ms=2,label=f"r{i}c{j} (d={rr[i,j]:.1f})")
ax[0].set_title('S7 bkg-subtracted pixel r12c10 (step pixel)'); ax[1].set_title('neighbouring pixels'); 
for a in ax[:2]: a.axvspan(TC-DUR/2,TC+DUR/2,color='orange',alpha=.3); a.legend(fontsize=7); a.set_ylim(-30,40)
# full-sector series of the step pixel
ax[2].plot(t,Fb[:,12,10],',k'); ax[2].set_title('r12c10 full sector'); ax[2].axvline(TC,color='orange')
fig.tight_layout(); fig.savefig('figs/step4_pixel_s7.png',dpi=85)
# photometry excluding that pixel
grow=[]
for r_ in [1.5,2.0,2.5,3.0]:
    ap=rr<=r_
    for excl in [False,True]:
        a=ap.copy()
        if excl: a[12,10]=False
        y=Fb[:,a].sum(1); m=measure(t,y,TC,DUR,win=1.0)
        pre=(t>1492.0)&(t<1492.84); post=(t>1492.9)&(t<1493.7)
        d=dict(r=r_,npix=int(a.sum()),excl_r12c10=excl,depth_ppt=round(m['depth']*1e3,2),sig=round(m['sig_adopt']*1e3,2),frac_deeper=round(float(m['frac_deeper']),3),
               step_ppt=round(float((np.median(y[post])/np.median(y[pre])-1)*1e3),2))
        grow.append(d); print(d)
out['phot_excluding_step_pixel']=grow
# per-pixel step z-map
pre=(t>1492.0)&(t<1492.84); post=(t>1492.9)&(t<1493.7)
S=np.median(Fb[post],0)-np.median(Fb[pre],0); N=1.4826*np.median(np.abs(np.diff(Fb[(t>1493)&(t<1500)],axis=0)),axis=0)/np.sqrt(2)
z=S/(N/np.sqrt(min(pre.sum(),post.sum())))
o=np.argsort(-np.abs(z).ravel())[:6]; out['step_z_top']=[(int(k//21),int(k%21),round(float(z.flat[k]),1)) for k in o]; print('step z top',out['step_z_top'])
json.dump(out,open('data/step4_pixel.json','w'),indent=1)
