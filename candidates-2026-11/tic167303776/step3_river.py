"""River plot: SAP (30-min, local 80th-percentile baseline) vs rotation phase (P=1.8627 d) and cycle; phase concentration of dips per sector."""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, json
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
T,Y,S=np.load("data/sap30.npy"); d=np.load("data/dips.npy")
P=1.8627; T0=1456.31
out={}
# Rayleigh test of dip phases per sector, and for the event
for s in np.unique(S):
    m=d[:,3]==s; ph=2*np.pi*((d[m,0]-T0)/P%1)
    if m.sum()<3: continue
    R=np.abs(np.mean(np.exp(1j*ph))); n=m.sum(); p=np.exp(-n*R**2)
    out[int(s)]=dict(n=int(n),R=round(float(R),2),p=float(f"{p:.2g}"),mean_phase=round(float(np.angle(np.mean(np.exp(1j*ph)))/2/np.pi%1),2))
ph=2*np.pi*((d[:,0]-T0)/P%1); R=np.abs(np.mean(np.exp(1j*ph)));print("all dips Rayleigh R",R,"n",len(d))
for k,v in out.items(): print(k,v)
fig,ax=plt.subplots(1,3,figsize=(16,8))
for a,(y0,y1) in zip(ax,[(1430,1470),(3060,3100),(3740,3780)]):
    m=(T>y0)&(T<y1); cyc=np.floor((T[m]-T0)/P); phs=(T[m]-T0)/P%1
    sc=a.scatter(phs,cyc,c=Y[m],s=14,marker='s',cmap='inferno',vmin=0.8,vmax=1.03); a.set_xlabel(f"phase (P={P} d, 0 at 1456.31)"); a.set_ylabel("cycle"); a.set_title(f"BTJD {y0}-{y1}")
plt.colorbar(sc,ax=ax[-1]); plt.tight_layout(); plt.savefig("figs/step3_river.png",dpi=90)
json.dump(out,open("data/step3_river.json","w"),indent=1)
