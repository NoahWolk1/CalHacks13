"""S30 TESScut: where is the event? Per-pixel deficit images (local linear baseline per pixel, +-0.7 d window, EB eclipses masked from
the baseline) for the event and for every S30 primary/secondary eclipse of the 4.467-d EB OGLE-LMC-ECL-51276. Each deficit image is fitted
with a free-position Gaussian PSF (width from the stacked EB-primary image); positions compared with each other and with the Gaia stars."""
import warnings; warnings.filterwarnings("ignore")
import glob, json, numpy as np, lightkurve as lk
from astropy.table import Table
from scipy.optimize import least_squares
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
from common import RA, DEC, TC, DUR
import sys
SEC=int(sys.argv[1]) if len(sys.argv)>1 else 30
if len(sys.argv)>2: TC=float(sys.argv[2])
SUF="" if SEC==30 else f"_s{SEC}"
eb=json.load(open("data/step5_eb.json")); P,T0,psec=eb['P'],eb['T0_btjd'],eb['secondary_phase']
tpf=lk.read(glob.glob(f"data/tesscut/**/tess-s00{SEC}*.fits",recursive=True)[0])
t=tpf.time.value; F=tpf.flux.value.astype(float); q=tpf.quality
ok=np.all(np.isfinite(F),axis=(1,2))&(q==0); t=t[ok]; F=F[ok]
ny,nx=F.shape[1:]; med=np.nanmedian(F,0)
g=Table.read("data/gaia_3arcmin.csv"); gx,gy=tpf.wcs.world_to_pixel_values(np.array(g["ra"]),np.array(g["dec"]))
G=np.array(g["phot_g_mean_mag"])
ecl=[]
k0=int(np.round((t.mean()-T0)/P))
for k in range(k0-10,k0+10):
    for lab,off in (("primary",0),("secondary",psec)):
        te=T0+(k+off)*P
        if t.min()+0.3<te<t.max()-0.3: ecl.append((lab,te))
allecl=np.array([e[1] for e in ecl])
def deficit(tc,hw=0.08,win=0.7):
    w=np.abs(t-tc)<win
    inn=np.abs(t-tc)<hw
    # baseline excludes the event +-0.25 d and any EB eclipse (+-0.25 d) and the main event
    bl=w&(np.abs(t-tc)>0.25)
    for te in list(allecl)+[TC]:
        if abs(te-tc)>0.01: bl&=np.abs(t-te)>0.25
    if inn.sum()<4 or bl.sum()<20: return None,None,None
    X=np.vstack([np.ones(bl.sum()),t[bl]-tc]).T
    D=np.zeros((ny,nx)); E=np.zeros((ny,nx))
    for i in range(ny):
        for j in range(nx):
            c,*_=np.linalg.lstsq(X,F[bl,i,j],rcond=None); r=F[bl,i,j]-X@c
            D[i,j]=c[0]-np.mean(F[inn,i,j]); E[i,j]=np.std(r)*np.sqrt(1/inn.sum()+1/bl.sum())
    # aperture photometry depth (r=1.5 px around target) for reference
    return D,E,inn.sum()
Y,X=np.mgrid[:ny,:nx]
def gfit(D,E,x0,y0,sig=None):
    m=np.hypot(X-x0,Y-y0)<4
    def mod(p):
        a,x,y,s,c=p if sig is None else (*p[:3],sig,p[3])
        return a*np.exp(-((X-x)**2+(Y-y)**2)/(2*s**2))+c
    p0=[D[m].max(),x0,y0,0.9,0] if sig is None else [D[m].max(),x0,y0,0]
    lo=[0,x0-3,y0-3,0.4,-np.inf] if sig is None else [0,x0-3,y0-3,-np.inf]; hi=[np.inf,x0+3,y0+3,3,np.inf] if sig is None else [np.inf,x0+3,y0+3,np.inf]
    s=least_squares(lambda p:((mod(p)-D)/E)[m],p0,bounds=(lo,hi))
    J=s.jac; cov=np.linalg.pinv(J.T@J)*max(1,2*s.cost/(m.sum()-len(p0)))
    return s.x, np.sqrt(np.diag(cov)), 2*s.cost
xt,yt=gx[0],gy[0]
# stacked EB primaries -> PSF width
res={}
stacks={}
for lab in ("primary","secondary"):
    Ds=[];Es=[]
    for l,te in ecl:
        if l!=lab: continue
        D,E,n=deficit(te)
        if D is None or not np.isfinite(D).all(): continue
        Ds.append(D);Es.append(E)
        p,pe,chi=gfit(D,E,xt,yt); res[f"{lab} {te:.3f}"]=dict(x=p[1],y=p[2],ex=pe[1],ey=pe[2],amp=p[0],sig=p[3])
    if not Ds: print("no usable",lab); continue
    D=np.mean(Ds,0); E=np.sqrt(np.sum(np.array(Es)**2,0))/len(Es); stacks[lab]=(D,E)
    p,pe,chi=gfit(D,E,xt,yt); res[f"{lab} stack (n={len(Ds)})"]=dict(x=p[1],y=p[2],ex=pe[1],ey=pe[2],amp=p[0],sig=p[3])
sigpsf=res[[k for k in res if k.startswith("primary stack")][0]]["sig"]
D,E,n=deficit(TC); stacks["event"]=(D,E)
p,pe,chi=gfit(D,E,xt,yt); res["event"]=dict(x=p[1],y=p[2],ex=pe[1],ey=pe[2],amp=p[0],sig=p[3])
p,pe,chi=gfit(D,E,xt,yt,sig=sigpsf); res["event (PSF width fixed)"]=dict(x=p[1],y=p[2],ex=pe[1],ey=pe[2],amp=p[0],sig=sigpsf)
# fixed-position fits: chi2 with the PSF at each Gaia star
cand=[i for i in range(len(g)) if g["sep"][i]<60 and G[i]<17.5]
def fixed(D,E,i):
    m=np.hypot(X-xt,Y-yt)<4
    psf=np.exp(-((X-gx[i])**2+(Y-gy[i])**2)/(2*sigpsf**2))
    A=np.vstack([psf[m]/E[m],1/E[m]]).T; c,*_=np.linalg.lstsq(A,D[m]/E[m],rcond=None); r=D[m]/E[m]-A@c
    return float((r**2).sum()), float(c[0])
fx={}
for lab in ("event","primary","secondary"):
    D,E=stacks[lab]; rows=[]
    for i in cand:
        chi,a=fixed(D,E,i); rows.append(dict(source_id=int(g["source_id"][i]),sep=round(float(g["sep"][i]),1),G=round(float(G[i]),2),chi2=round(chi,1),amp=round(a,1)))
    rows.sort(key=lambda r:r["chi2"]); best=rows[0]["chi2"]
    for r in rows: r["dchi2"]=round(r["chi2"]-best,1)
    fx[lab]=rows[:8]
out=dict(target_px=[float(xt),float(yt)],ogle51276_px=None,fits=res,fixed_position=fx,psf_sigma_px=sigpsf,eclipses_in_S30=ecl)
# Gaia star nearest OGLE-LMC-ECL-51276 (9.8")
i51=int(np.argmin(np.abs(np.array(g["sep"])-9.85)+ (np.abs(G-14.63)>0.1)*99)); out["ogle51276_px"]=[float(gx[i51]),float(gy[i51])]; out["ogle51276_gaia"]=int(g["source_id"][i51])
for k,v in res.items():
    v["dx_from_target_arcsec"]=(v["x"]-xt)*21; v["dy_from_target_arcsec"]=(v["y"]-yt)*21
    v["dist_to_target_arcsec"]=float(np.hypot(v["x"]-xt,v["y"]-yt)*21); v["dist_to_EB_arcsec"]=float(np.hypot(v["x"]-gx[i51],v["y"]-gy[i51])*21)
for k,v in res.items(): print(f"{k:28s} x={v['x']:.3f}±{v['ex']:.3f} y={v['y']:.3f}±{v['ey']:.3f} amp={v['amp']:.1f} sig={v['sig']:.2f}  to target {v['dist_to_target_arcsec']:.1f}\"  to EB {v['dist_to_EB_arcsec']:.1f}\"")
print("target px",xt,yt,"EB px",gx[i51],gy[i51])
for lab,rows in fx.items():
    print("== fixed-position PSF fits:",lab)
    for r in rows: print("  ",r)
json.dump(out,open(f"data/step4_diffimage{SUF}.json","w"),indent=1,default=float)
fig,ax=plt.subplots(1,4,figsize=(20,5))
for a,(img,ttl) in zip(ax,[(np.log10(np.clip(med,1,None)),f"S{SEC} median (log)"),(stacks["event"][0],"event deficit"),(stacks["primary"][0],"EB primary stack deficit"),(stacks["secondary"][0],"EB secondary stack deficit")]):
    im=a.imshow(img,origin="lower"); plt.colorbar(im,ax=a,fraction=.046); a.set_title(ttl)
    b=G<16.5; a.scatter(gx[b],gy[b],s=np.clip((17-G[b])*25,5,300),facecolors='none',edgecolors='w',lw=.7)
    a.plot(xt,yt,'r+',ms=14,mew=2); a.plot(gx[i51],gy[i51],'mx',ms=12,mew=2); a.set_xlim(xt-5,xt+5); a.set_ylim(yt-5,yt+5)
for a,lab in zip(ax[1:],["event","primary","secondary"]):
    v=res["event" if lab=="event" else [k for k in res if k.startswith(lab+" stack")][0]]; a.errorbar(v["x"],v["y"],xerr=v["ex"],yerr=v["ey"],fmt='co',ms=5)
plt.suptitle("S30 TESScut; red + target, magenta x OGLE-LMC-ECL-51276, cyan: fitted PSF position; circles Gaia G<16.5"); plt.tight_layout(); plt.savefig(f"figs/step4_diffimage{SUF}.png",dpi=90)
