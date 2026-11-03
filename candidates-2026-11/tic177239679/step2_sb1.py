"""Is the 2.37 d modulation the companion's Gaia SB1 orbit? Periodogram, phase vs Gaia conjunctions, and where the two events fall."""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, json
from astropy.timeseries import LombScargle
from lcio import load_all
from common import *
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
f=1.0361e-7*KRV**3*PB*(1-ECC**2)**1.5
M1=1.176
m2=[m for m in np.linspace(0.05,2,20000) if m**3/(M1+m)**2>=f][0]
a=((M1+m2)*(PB/365.25)**2)**(1/3)*215.03
print(f"SB1: P {PB:.6f} d, K {KRV:.1f} km/s, e {ECC:.3f}; f(M) {f:.4f} Msun; M2,min {m2:.3f} Msun (M1={M1}); a {a:.2f} Rsun; a/R1 {a/1.48:.2f}")
out=dict(fM=f,M2min=m2,a_Rsun=a)
c=conj_times(TC1-5,TC1+5); print("Gaia conjunctions near TC1:",c)
c2=conj_times(TC2-5,TC2+5); print("near TC2:",c2)
print("phase of TC1, TC2 from 'prim_behind' conj:",phase_b(TC1),phase_b(TC2))
sigt=np.hypot(NSS["period_error"]*(TC1-TP)/PB,NSS["t_periastron_error"]); print("propagated timing error at TC1 (d):",sigt, "at TC2:",np.hypot(NSS["period_error"]*(TC2-TP)/PB,NSS["t_periastron_error"]))
out.update(phase_TC1=float(phase_b(TC1)),phase_TC2=float(phase_b(TC2)),sig_t_TC1=float(sigt))
res={}
fig,ax=plt.subplots(2,2,figsize=(13,8))
for lab,auth,col in [("TESS-SPOC SAP s61-69","TESS-SPOC","SAP_FLUX"),("QLP SAP all","QLP","SAP_FLUX")]:
    T=[];Y=[]
    for r in load_all(authors=[auth]):
        t=r["t"]; y=r[col]; ok=np.isfinite(t)&np.isfinite(y)&(r["q"]==0)
        if ok.sum()<200: continue
        t,y=t[ok],y[ok]
        # remove slow per-orbit trend (>5 d) with a 3rd-order polynomial per segment
        br=np.where(np.diff(t)>0.5)[0]+1
        for idx in np.split(np.arange(len(t)),br):
            if len(idx)<50: continue
            ts=t[idx]; ys=y[idx]/np.median(y[idx]); p=np.polyfit(ts-ts.mean(),ys,2); T.append(ts); Y.append(ys/np.polyval(p,ts-ts.mean()))
    T=np.concatenate(T); Y=np.concatenate(Y)
    fr=np.linspace(1/20,6,200000); pw=LombScargle(T,Y).power(fr)
    top=[]; pw2=pw.copy()
    for _ in range(5):
        k=np.argmax(pw2); top.append((round(1/fr[k],5),round(float(pw2[k]),4))); pw2[max(0,k-300):k+300]=0
    print(lab,"top LS periods (d, power):",top)
    res[lab]=top
    i=0 if auth=="TESS-SPOC" else 1
    ax[0,i].plot(1/fr,pw,lw=.6); ax[0,i].set_xscale("log"); ax[0,i].axvline(PB,color='r',ls='--',lw=.8); ax[0,i].axvline(PB/2,color='r',ls=':',lw=.8)
    ax[0,i].set_title(lab+" LS (red: Gaia SB1 P, P/2)"); ax[0,i].set_xlabel("period [d]")
    ph=phase_b(T)
    bins=np.linspace(-.5,.5,51); idx=np.digitize(ph,bins)
    mb=[np.median(Y[idx==j]) for j in range(1,51)]
    ax[1,i].plot(ph,(Y-1)*1e3,',',color='0.75'); ax[1,i].plot(0.5*(bins[1:]+bins[:-1]),(np.array(mb)-1)*1e3,'k.-')
    for tc,cc in [(TC1,'orange'),(TC2,'m')]: ax[1,i].axvline(phase_b(tc),color=cc)
    ax[1,i].set_ylim(-6,6); ax[1,i].set_xlabel("phase of companion SB1 (0 = companion-in-front conjunction from Gaia)")
    res[lab+" binned"]=[float(x) for x in mb]
out["LS"]=res
plt.tight_layout(); plt.savefig("figs/sb1_periodogram_phase.png",dpi=110)
json.dump(out,open("data/step2_sb1.json","w"),indent=1,default=str)
