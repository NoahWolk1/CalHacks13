"""Eclipse depth each star would need, calibrated on the EB: total deficit (sum of the S30 deficit image within 2 px of the fitted
position) divided by the star's expected TESS flux (T from Gaia G, BP-RP; 15000 e/s at T = 10). Check: the EB primary on
OGLE-LMC-ECL-51276 should come out near OGLE's I-band 0.299 mag (24%)."""
import warnings; warnings.filterwarnings("ignore")
import glob, json, numpy as np, lightkurve as lk
from astropy.table import Table
from common import TC
d=json.load(open("data/step4_diffimage.json"))
eb=json.load(open("data/step5_eb.json")); P,T0,psec=eb['P'],eb['T0_btjd'],eb['secondary_phase']
tpf=lk.read(glob.glob("data/tesscut/**/tess-s0030*.fits",recursive=True)[0])
t=tpf.time.value; F=tpf.flux.value.astype(float); q=tpf.quality
ok=np.all(np.isfinite(F),axis=(1,2))&(q==0); t=t[ok]; F=F[ok]; ny,nx=F.shape[1:]
g=Table.read("data/gaia_3arcmin.csv"); G=np.array(g["phot_g_mean_mag"]); br=np.array(g["bp_rp"].filled(0.0) if hasattr(g["bp_rp"],"filled") else g["bp_rp"])
Tm=G-0.00522555*br**3+0.0891337*br**2-0.633923*br+0.0324473; fl=15000*10**(-0.4*(Tm-10))
Y,X=np.mgrid[:ny,:nx]
ecl=[(l,T0+(k+o)*P) for k in range(-10,10) for l,o in (("primary",0),("secondary",psec)) if t.min()+0.3<T0+(k+o)*P<t.max()-0.3]
mask=[e[1] for e in ecl]+[TC]
def deficit(tc,hw=0.08,win=0.7):
    w=np.abs(t-tc)<win; inn=np.abs(t-tc)<hw; bl=w&(np.abs(t-tc)>0.25)
    for te in mask:
        if abs(te-tc)>0.01: bl&=np.abs(t-te)>0.25
    if inn.sum()<4 or bl.sum()<20: return None
    Xd=np.vstack([np.ones(bl.sum()),t[bl]-tc]).T; B=np.linalg.lstsq(Xd,F[bl].reshape(bl.sum(),-1),rcond=None)[0]
    return (B[0]-F[inn].reshape(inn.sum(),-1).mean(0)).reshape(ny,nx)
def total(D,x,y,r=2.0): return float(D[np.hypot(X-x,Y-y)<=r].sum())
out={}
for lab in ("primary","secondary"):
    Ds=[deficit(te) for l,te in ecl if l==lab]; Ds=[x for x in Ds if x is not None]
    key=[k for k in d["fits"] if k.startswith(lab+" stack")][0]; v=d["fits"][key]
    out[lab]=dict(n=len(Ds),total_deficit_e_s=total(np.median(Ds,0),v["x"],v["y"]),gauss_integral_e_s=v["amp"]*2*np.pi*v["sig"]**2)
De=deficit(TC); v=d["fits"]["event (PSF width fixed)"]; out["event"]=dict(total_deficit_e_s=total(De,v["x"],v["y"]),gauss_integral_e_s=v["amp"]*2*np.pi*v["sig"]**2)
stars={"target":4660118479135990016,"EB OGLE-LMC-ECL-51276 (9.8\")":4660118479179218304,"G14.25 at 14.1\"":4660118479179211904,"G15.67 at 5.5\"":4660118479179214848,
       "G13.84 at 16.9\"":4660118474864340224,"G12.04 at 23.5\"":4660118680998109312,"G15.47 at 20.7\"":4660118685294371840,"G18.33 at 18.6\"":4660118685294371712}
sid=np.array(g["source_id"])
out["stars"]={}
for n,s in stars.items():
    i=int(np.where(sid==s)[0][0])
    out["stars"][n]=dict(G=float(G[i]),T_est=round(float(Tm[i]),2),flux_e_s=round(float(fl[i]),1),
        event_depth_needed=round(out["event"]["gauss_integral_e_s"]/fl[i],3),event_depth_needed_apsum=round(out["event"]["total_deficit_e_s"]/fl[i],3))
i=int(np.where(sid==4660118479179218304)[0][0])
out["EB_check"]=dict(primary_depth_on_EB=out["primary"]["gauss_integral_e_s"]/fl[i],secondary_depth_on_EB=out["secondary"]["gauss_integral_e_s"]/fl[i],primary_apsum=out["primary"]["total_deficit_e_s"]/fl[i],secondary_apsum=out["secondary"]["total_deficit_e_s"]/fl[i],OGLE_I=dict(primary=1-10**(-0.4*0.299),secondary=1-10**(-0.4*0.285)))
print(json.dumps(out,indent=1)); json.dump(out,open("data/step4_depths.json","w"),indent=1)
