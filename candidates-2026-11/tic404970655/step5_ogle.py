"""OGLE-IV I/V photometry of OGLE-LMC-ECL-37031: fold on the catalogue ephemeris, locate primary and secondary,
refine the period with a box search near the catalogue value, measure depths and widths, and predict TESS eclipse times."""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, json
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
P0, E0 = 20.1104183, 2460000.2755-2457000   # HJD -> 'BTJD-like' (HJD-BJD < 0.001 d)
I=np.loadtxt("data/ogle/ecl37031_I.dat"); V=np.loadtxt("data/ogle/ecl37031_V.dat")
t=I[:,0]-2457000; m=I[:,1]; e=I[:,2]
out=dict(n_I=len(t),n_V=len(V),span_d=float(t.max()-t.min()),t_range=[float(t.min()),float(t.max())])
med=np.median(m); out["I_median"]=float(med)
def ph(tt,P,E): return ((tt-E)/P+0.5)%1-0.5
# refine P: minimise dispersion of in-eclipse points phase around 0
best=None
for P in np.linspace(P0-0.002,P0+0.002,801):
    p=ph(t,P,E0); inn=np.abs(p)<0.015
    s=np.sum((m[inn]-med))  # deeper = larger mag sum
    if best is None or s>best[1]: best=(P,s)
out["P_refined_box"]=float(best[0])
p=ph(t,P0,E0)
# secondary: phase of faint points away from primary
faint=(m-med)>0.03
out["faint_points_phases"]=sorted([round(float(x),4) for x in p[faint]])
# phase bins
order=np.argsort(p)
# primary/secondary depth from the faintest points within the eclipses
prim=np.abs(p)<0.02
out["primary_max_depth_mag"]=float((m[prim]-med).max()) if prim.any() else None
sphase=np.median(p[faint & (np.abs(p)>0.05)]) if (faint & (np.abs(p)>0.05)).any() else None
out["secondary_phase_est"]=float(sphase) if sphase is not None else None
if sphase is not None:
    sec=np.abs(p-sphase)<0.02; out["secondary_max_depth_mag"]=float((m[sec]-med).max())
# eclipse half-width: phase range where points are >0.02 mag below median near each eclipse
for lab,c in [("primary",0.0),("secondary",sphase)]:
    if c is None: continue
    w=np.abs(p-c)<0.05; dd=(m-med)>0.02
    x=p[w&dd]
    if len(x): out[f"{lab}_faint_phase_span"]=[float(x.min()),float(x.max())]; out[f"{lab}_faint_span_h"]=float((x.max()-x.min())*P0*24)
# predicted TESS eclipse times in S28-S39 (BTJD 2036-2390)
pr=[E0+k*P0 for k in range(-60,10) if 2030<E0+k*P0<2400]
out["pred_primary_BTJD"]=[round(x,3) for x in pr]
if sphase is not None: out["pred_secondary_BTJD"]=[round(x+sphase*P0,3) for x in pr]
out["phase_of_2155.45"]=float(ph(np.array([2155.45]),P0,E0)[0]); out["phase_of_2162.10"]=float(ph(np.array([2162.10]),P0,E0)[0])
print(json.dumps(out,indent=1)); json.dump(out,open("data/step5_ogle.json","w"),indent=1)
fig,ax=plt.subplots(1,3,figsize=(16,4.5))
ax[0].plot(t,m,'k.',ms=2); ax[0].invert_yaxis(); ax[0].set_title("OGLE-IV I, ECL-37031"); ax[0].set_xlabel("HJD-2457000")
ax[1].plot(p,m,'k.',ms=3); vp=ph(V[:,0]-2457000,P0,E0); ax[1].plot(vp,V[:,1]-np.median(V[:,1])+med,'b.',ms=3,label='V (shifted)')
ax[1].invert_yaxis(); ax[1].set_xlabel(f"phase (P={P0} d)"); ax[1].legend()
ax[2].plot(p*P0*24,m,'k.',ms=4); 
if sphase is not None: ax[2].plot((p-sphase)*P0*24,m+0.15,'r.',ms=4,label='secondary (+0.15)')
ax[2].set_xlim(-20,20); ax[2].invert_yaxis(); ax[2].set_xlabel("hours from eclipse"); ax[2].legend()
fig.tight_layout(); fig.savefig("figs/step5_ogle.png",dpi=90)
