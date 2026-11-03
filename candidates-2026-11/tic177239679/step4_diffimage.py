"""S65 TESScut per-pixel regression: amplitude images of the event (8 h trapezoid), the 2.374 d SB1 signal and the 4.42 d signal,
fitted jointly per pixel with a per-orbit quadratic. Their centroids vs the Gaia positions. Plus the eclipse depth each Gaia
neighbour would need to make the observed dip."""
import warnings; warnings.filterwarnings("ignore")
import glob, json, numpy as np, lightkurve as lk
from astropy.table import Table
from measure import trapezoid
from common import *
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
tpf=lk.read(glob.glob("data/tesscut/tess-s0065*.fits")[0])
t=tpf.time.value; F=tpf.flux.value.astype(float); q=tpf.quality
ok=np.all(np.isfinite(F),axis=(1,2))&(q==0); t=t[ok]; F=F[ok]
med=np.nanmedian(F,0); bkg=np.nanmedian(F[:,med<np.nanpercentile(med,40)],1); Fb=F-bkg[:,None,None]
A=harm_design(t,((PB,3),(4.42,2)),2); s=trapezoid(t,TC1,DUR,0.15)
A=np.column_stack([A,-s]); ns=A.shape[1]-11
ny,nx=med.shape; Dimg=np.zeros((ny,nx)); Eimg=np.zeros((ny,nx)); SB=np.zeros((ny,nx)); P2=np.zeros((ny,nx))
Ainv=np.linalg.pinv(A)
for y in range(ny):
    for x in range(nx):
        v=Fb[:,y,x]; c=Ainv@v; r=v-A@c
        Dimg[y,x]=c[-1]; Eimg[y,x]=np.sqrt(np.linalg.pinv(A.T@A)[-1,-1]*np.var(r))
        sb=A[:,ns:ns+6]@c[ns:ns+6]; SB[y,x]=sb.max()-sb.min()
        p2=A[:,ns+6:ns+10]@c[ns+6:ns+10]; P2[y,x]=p2.max()-p2.min()
g=Table.read("data/gaia_3arcmin.csv"); gx,gy=tpf.wcs.world_to_pixel_values(np.array(g["ra"]),np.array(g["dec"]))
mb=np.nanmedian(Fb,0)
def cen(img,r0=3):
    xt,yt=gx[0],gy[0]; Y,X=np.mgrid[:ny,:nx]; m=np.hypot(X-xt,Y-yt)<=r0; w=np.clip(img,0,None)*m
    return float((w*X).sum()/w.sum()),float((w*Y).sum()/w.sum())
out={}
for lab,img in [("median flux",mb),("event depth",Dimg),("SB1 2.374 d amplitude",SB),("4.42 d amplitude",P2)]:
    cx,cy=cen(img); out[lab]=dict(cx=cx,cy=cy,dx_arcsec=(cx-gx[0])*21,dy_arcsec=(cy-gy[0])*21)
    print(f"{lab:24s} centroid ({cx:.3f},{cy:.3f}) px; offset from Gaia target {(cx-gx[0])*21:+.1f}, {(cy-gy[0])*21:+.1f} arcsec")
print("pair: target",gx[0],gy[0]," companion",gx[1],gy[1]," sep px",np.hypot(gx[1]-gx[0],gy[1]-gy[0]))
Y,X=np.mgrid[:ny,:nx]; ap=np.hypot(X-gx[0],Y-gy[0])<=1.8
out["event_depth_r1.8_ppt"]=float(Dimg[ap].sum()/mb[ap].sum()*1e3); out["event_snr_r1.8"]=float(Dimg[ap].sum()/np.sqrt((Eimg[ap]**2).sum()))
print("event in r=1.8 aperture from per-pixel fit (jointly with harmonics):",out["event_depth_r1.8_ppt"],"ppt, SNR (white)",out["event_snr_r1.8"])
# Neighbour table: required eclipse depth. Observed depth relative to the total r=1.8 aperture flux (raw local-quadratic SAP-like) and after the harmonic model
br=np.array(g["bp_rp"]); G=np.array(g["phot_g_mean_mag"]); br=np.where(np.isfinite(br),br,1.0)
T=G-0.00522555*br**3+0.0891337*br**2-0.633923*br+0.0324473
fl=10**(-0.4*(T-10)); Ftot_pair=fl[0]+fl[1]
rows=[]
for D_obs,lab in [(1.37e-3,"vet depth 1.37 ppt (on target)"),(0.4e-3*Ftot_pair/fl[0],"residual after harmonic model 0.4 ppt of pair light")]:
    for i in range(min(len(g),15)):
        need=D_obs*fl[0]/fl[i]
        rows.append(dict(case=lab,source_id=int(g["source_id"][i]),sep=round(float(g["sep"][i]),1),G=round(float(G[i]),2),T_est=round(float(T[i]),2),
                         required_eclipse=round(float(need),4) if need<1 else "impossible"))
for r in rows: print(r)
out["neighbours"]=rows
out["T_target"],out["T_companion"]=float(T[0]),float(T[1]); out["companion_light_fraction_of_pair"]=float(fl[1]/Ftot_pair)
print("companion fraction of pair light (T):",out["companion_light_fraction_of_pair"])
json.dump(out,open("data/step4_diffimage.json","w"),indent=1,default=str)
fig,ax=plt.subplots(1,4,figsize=(19,4.8))
for a,img,ttl in zip(ax,[np.log10(np.clip(mb,1,None)),Dimg,SB,P2],["median (log e/s)","8 h event depth (e/s), joint fit","2.374 d SB1 amplitude p2p (e/s)","4.42 d amplitude p2p (e/s)"]):
    im=a.imshow(img,origin="lower",cmap="viridis"); plt.colorbar(im,ax=a,fraction=.046); a.set_title(ttl,fontsize=9)
    b=G<17; a.scatter(gx[b],gy[b],s=np.clip((18-G[b])*10,5,200),facecolors='none',edgecolors='w',lw=.7); a.plot(gx[0],gy[0],'r+',ms=12,mew=2)
    a.set_xlim(4.5,16.5); a.set_ylim(4.5,16.5)
plt.suptitle("S65 TESScut, per-pixel joint fit (Gaia G<17 circles; target + 2.3\" companion are the blended pair at the red +)"); plt.tight_layout(); plt.savefig("figs/diffimage_s65.png",dpi=110)
