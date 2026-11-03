"""PSF photometry on the S30 TESScut (Gaussian PSF, width from the EB-primary stack, at the Gaia positions of all G<18 stars within 75").
(1) median image -> each star's flux; (2) event and EB deficit images -> joint fit with free amplitudes on the candidate stars ->
eclipse depth on each star. Calibration: the EB primary depth on OGLE-LMC-ECL-51276 should be near OGLE's 0.30 mag (I)."""
import warnings; warnings.filterwarnings("ignore")
import glob, json, numpy as np, lightkurve as lk
from astropy.table import Table
from common import TC
d=json.load(open("data/step4_diffimage.json")); sig=d["psf_sigma_px"]
eb=json.load(open("data/step5_eb.json")); P,T0,psec=eb['P'],eb['T0_btjd'],eb['secondary_phase']
tpf=lk.read(glob.glob("data/tesscut/**/tess-s0030*.fits",recursive=True)[0])
t=tpf.time.value; F=tpf.flux.value.astype(float); q=tpf.quality
ok=np.all(np.isfinite(F),axis=(1,2))&(q==0); t=t[ok]; F=F[ok]; ny,nx=F.shape[1:]
g=Table.read("data/gaia_3arcmin.csv"); gx,gy=tpf.wcs.world_to_pixel_values(np.array(g["ra"]),np.array(g["dec"])); G=np.array(g["phot_g_mean_mag"])
Y,X=np.mgrid[:ny,:nx]; xt,yt=gx[0],gy[0]
sel=np.where((np.array(g["sep"])<75)&(G<18))[0]
psf=lambda i:np.exp(-((X-gx[i])**2+(Y-gy[i])**2)/(2*sig**2))/(2*np.pi*sig**2)
m=np.hypot(X-xt,Y-yt)<4.5
# (1) median image (background from faint pixels), all stars + constant
med=np.nanmedian(F,0)
A=np.vstack([psf(i)[m] for i in sel]+[np.ones(m.sum())]).T
c,*_=np.linalg.lstsq(A,med[m],rcond=None)
flux={int(g["source_id"][i]):float(c[k]) for k,i in enumerate(sel)}
ids={"target":int(g["source_id"][0]),"EB51276":4660118479179218304,"G14.25":4660118479179211904,"G15.67_5.5":4660118479179214848,"G13.84_16.9":4660118474864340224,"G12.04_23.5":4660118680998109312,"G15.47_20.7":4660118685294371840}
idx={k:int(np.where(np.array(g["source_id"])==v)[0][0]) for k,v in ids.items()}
out=dict(psf_sigma=sig, star_flux_e_s={k:flux.get(v) for k,v in ids.items()}, star_G={k:float(G[idx[k]]) for k in ids})
tot=sum(c[:-1][[k for k,i in enumerate(sel) if np.hypot(gx[i]-xt,gy[i]-yt)<1.5]]) if True else 0
out["target_fraction_of_flux_within_1.5px_of_target"]=flux[ids["target"]]/float(med[np.hypot(X-xt,Y-yt)<1.5].sum())
# (2) deficit images (recomputed as in step4_diffimage)
def deficit(tc,hw=0.08,win=0.7,mask=()):
    w=np.abs(t-tc)<win; inn=np.abs(t-tc)<hw; bl=w&(np.abs(t-tc)>0.25)
    for te in mask:
        if abs(te-tc)>0.01: bl&=np.abs(t-te)>0.25
    Xd=np.vstack([np.ones(bl.sum()),t[bl]-tc]).T; Dimg=np.zeros((ny,nx)); E=np.zeros((ny,nx))
    for i in range(ny):
        for j in range(nx):
            cc,*_=np.linalg.lstsq(Xd,F[bl,i,j],rcond=None); r=F[bl,i,j]-Xd@cc
            Dimg[i,j]=cc[0]-np.mean(F[inn,i,j]); E[i,j]=np.std(r)*np.sqrt(1/inn.sum()+1/bl.sum())
    return Dimg,E
ecl=[(l,T0+(k+o)*P) for k in range(-10,10) for l,o in (("primary",0),("secondary",psec)) if t.min()+0.3<T0+(k+o)*P<t.max()-0.3]
mask=[e[1] for e in ecl]+[TC]
cands=["target","EB51276","G14.25","G15.67_5.5","G13.84_16.9","G12.04_23.5","G15.47_20.7"]
def joint(Dimg,E,names):
    A=np.vstack([psf(idx[n])[m]/E[m] for n in names]+[1/E[m]]).T; cc,*_=np.linalg.lstsq(A,Dimg[m]/E[m],rcond=None)
    r=Dimg[m]/E[m]-A@cc; cov=np.linalg.pinv(A.T@A)*max(1,(r**2).sum()/(m.sum()-A.shape[1]))
    return {n:dict(deficit_e_s=float(cc[k]),err=float(np.sqrt(cov[k,k])),depth_on_star=float(cc[k]/flux[ids[n]]),depth_err=float(np.sqrt(cov[k,k])/flux[ids[n]])) for k,n in enumerate(names)}, float((r**2).sum())
res={}
De,Ee=deficit(TC,mask=mask); res["event"],res["event_chi2"]=joint(De,Ee,cands)
for lab in ("primary","secondary"):
    Ds=[];Es=[]
    for l,te in ecl:
        if l==lab: a,b=deficit(te,mask=mask); Ds.append(a); Es.append(b)
    res[lab],res[lab+"_chi2"]=joint(np.mean(Ds,0),np.sqrt(np.sum(np.array(Es)**2,0))/len(Es),cands)
# single-star models for the event: chi2 per candidate
res["event_single_star_chi2"]={n:joint(De,Ee,[n])[1] for n in cands}
out["deficits"]=res
out["note"]="OGLE I-band primary depth of OGLE-LMC-ECL-51276: 0.299 mag = 24% ; secondary 0.285 mag = 23%"
print(json.dumps(out,indent=1)); json.dump(out,open("data/step4_psfphot.json","w"),indent=1)
