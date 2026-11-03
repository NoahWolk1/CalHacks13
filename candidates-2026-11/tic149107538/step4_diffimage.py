"""S67 TESScut: own aperture photometry (several radii, two backgrounds), event depth on a local quartic (+-1.5 d)
and on the harmonic model; per-pixel joint fit (harmonic rotation model + 8 h trapezoid) -> event and rotation
amplitude images and their centroids vs Gaia; eclipse depth each Gaia neighbour would need."""
import warnings; warnings.filterwarnings("ignore")
import glob, json, numpy as np, lightkurve as lk
from astropy.table import Table
from measure import trapezoid
from common import TC, DUR, RA, DEC
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
P=6.104
tpf=lk.read(glob.glob("data/tesscut/tess-s0067*.fits")[0])
t=tpf.time.value; F=tpf.flux.value.astype(float); q=tpf.quality
ok=np.all(np.isfinite(F),axis=(1,2))&(q==0)&(t<3134.5); t=t[ok]; F=F[ok]
med=np.nanmedian(F,0); ny,nx=med.shape
bkg_glob=np.nanmedian(F[:,med<np.nanpercentile(med,40)],1)
g=Table.read("data/gaia_2arcmin.csv"); gx,gy=tpf.wcs.world_to_pixel_values(np.array(g["ra"]),np.array(g["dec"]))
xt,yt=gx[0],gy[0]; Y,X=np.mgrid[:ny,:nx]; R=np.hypot(X-xt,Y-yt)
def harm(t):
    tm=t.mean(); x=(t-tm)/(t.max()-t.min()); cols=[x**k for k in range(3)]
    for h in range(1,4):
        for a in (np.sin,np.cos):
            b=a(2*np.pi*h*(t-tm)/P); cols+=[b,b*x]
    return np.vstack(cols).T
H=harm(t); s=trapezoid(t,TC,DUR); A=np.column_stack([H,-s])
w=np.abs(t-TC)<1.5; xx=(t[w]-TC)/1.5; AL=np.column_stack([np.vstack([xx**k for k in range(5)]).T,-s[w]])
def depths(lc):
    y=lc/np.median(lc)-1
    c,*_=np.linalg.lstsq(A,y,rcond=None); rr=y-A@c; e=np.sqrt(np.linalg.pinv(A.T@A)[-1,-1])*np.std(rr)
    cl,*_=np.linalg.lstsq(AL,y[w],rcond=None)
    return c[-1]*1e3,e*1e3,cl[-1]*1e3
out={"phot":[]}
for rad in [1.0,1.5,2.0,2.5,3.0,4.0]:
    ap=R<=rad
    ann=(R>5)&(R<7)&(med<np.nanpercentile(med,60))
    for bl,bk in [("global",bkg_glob),("annulus",np.nanmedian(F[:,ann],1))]:
        lc=(F[:,ap]-bk[:,None]).sum(1); dH,eH,dL=depths(lc)
        rec=dict(r_px=rad,npix=int(ap.sum()),bkg=bl,depth_harm_ppt=round(dH,3),sig_white_ppt=round(eH,3),depth_quartic_ppt=round(dL,3)); out["phot"].append(rec); print(rec)
Fb=F-bkg_glob[:,None,None]
Ainv=np.linalg.pinv(A); D=np.zeros((ny,nx)); E=np.zeros((ny,nx)); ROT=np.zeros((ny,nx))
for y in range(ny):
    for x in range(nx):
        v=Fb[:,y,x]; c=Ainv@v; r=v-A@c; D[y,x]=c[-1]; E[y,x]=np.sqrt(np.linalg.pinv(A.T@A)[-1,-1]*np.var(r))
        m=H[:,3:]@c[3:15]; ROT[y,x]=m.max()-m.min()
mb=np.nanmedian(Fb,0)
def cen(img,r0=2.5):
    m=R<=r0; ww=np.clip(img,0,None)*m; return float((ww*X).sum()/ww.sum()),float((ww*Y).sum()/ww.sum())
for lab,img in [("median flux",mb),("event depth",D),("rotation amplitude",ROT)]:
    cx,cy=cen(img); out[lab]=dict(dx_arcsec=round((cx-xt)*21,2),dy_arcsec=round((cy-yt)*21,2)); print(lab,out[lab])
ap=R<=2.0; out["event_r2_ppt"]=float(D[ap].sum()/mb[ap].sum()*1e3); out["event_snr_r2_white"]=float(D[ap].sum()/np.sqrt((E[ap]**2).sum()))
out["rot_amp_frac_r2"]=float(ROT[ap].sum()/mb[ap].sum())
print("event (per-pixel sum r=2):",out["event_r2_ppt"],"SNR(white)",out["event_snr_r2_white"],"rotation p2p frac",out["rot_amp_frac_r2"])
# ratio images: rotation amplitude / flux per pixel near target vs neighbour pixels
G=np.array(g["phot_g_mean_mag"]); br=np.array(g["bp_rp"]); br=np.where(np.isfinite(br),br,1.0)
T=G-0.00522555*br**3+0.0891337*br**2-0.633923*br+0.0324473
fl=10**(-0.4*(T-T[0]))
rows=[]
for D_obs,lab in [(1.91e-3,"sweep depth 1.91 ppt"),(1.1e-3,"harmonic-model depth 1.1 ppt")]:
    for i in range(1,len(g)):
        need=D_obs/fl[i]*(1+0)  # relative to target flux
        if g["sep"][i]>90: continue
        rows.append(dict(case=lab,source_id=int(g["source_id"][i]),sep=round(float(g["sep"][i]),1),G=round(float(G[i]),2),T_est=round(float(T[i]),2),
                         required_eclipse=round(float(need),3) if need<1 else "impossible"))
poss=[r for r in rows if r["required_eclipse"]!="impossible"]
for r in poss: print(r)
out["neighbours_possible"]=poss; out["n_neighbours_checked"]=len(rows)//2
json.dump(out,open("data/step4_diffimage.json","w"),indent=1,default=str)
fig,ax=plt.subplots(1,3,figsize=(15,4.8))
for a,img,ttl in zip(ax,[np.log10(np.clip(mb,1,None)),D,ROT],["median (log e/s)","8 h event depth (e/s), joint fit","rotation p2p amplitude (e/s)"]):
    im=a.imshow(img,origin="lower",cmap="viridis"); plt.colorbar(im,ax=a,fraction=.046); a.set_title(ttl,fontsize=9)
    b=G<18.5; a.scatter(gx[b],gy[b],s=np.clip((19-G[b])*10,5,200),facecolors='none',edgecolors='w',lw=.7); a.plot(xt,yt,'r+',ms=12,mew=2)
plt.suptitle("S67 TESScut orbit 1, per-pixel joint fit"); plt.tight_layout(); plt.savefig("figs/step4_diffimage.png",dpi=100)
