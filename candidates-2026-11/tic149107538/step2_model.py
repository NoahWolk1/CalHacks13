"""Model the rotational modulation around the event and re-measure the dip.
(a) local polynomial of order 2..5 over +-W d with the event masked, then the 8 h trapezoid depth jointly
(b) harmonic model of P_rot (3 harmonics, amplitudes linear in time) + per-orbit quadratic over orbit 1 of S67
(c) re-centre: scan tc and duration on the (b) residuals."""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, json
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
from lcio import load_all
from measure import trapezoid
from common import TC, DUR, PROT
out={}
def joint(t,y,cols,tc,dur):
    s=trapezoid(t,tc,dur); A=np.vstack([-s]+cols).T
    c,*_=np.linalg.lstsq(A,y,rcond=None); r=y-A@c; rms=np.std(r)
    cov=np.linalg.pinv(A.T@A)*rms**2
    return c[0],np.sqrt(cov[0,0]),r,A@c,c
fig,axs=plt.subplots(3,1,figsize=(11,11))
for r in load_all(sectors=[67]):
    for col in ['SAP_FLUX','PDCSAP_FLUX','SYS_RM_FLUX','FLUX']:
        if col not in r: continue
        key=f"{r['author']}_{col}"
        t=r['t']; f=r[col]; g=(r['q']==0)&np.isfinite(f)&(t<3134.5); t=t[g]; y=f[g]/np.nanmedian(f[g])-1
        res={}
        for W in [1.0,1.5,2.0]:
            w=np.abs(t-TC)<W
            for o in [2,3,4,5]:
                x=(t[w]-TC)/W; cols=[x**k for k in range(o+1)]
                d,e,rr,_,_=joint(t[w],y[w],cols,TC,DUR)
                res[f"poly_W{W}_o{o}"]=(round(d*1e3,3),round(e*1e3,3))
        # (b) harmonic model over orbit 1
        tm=t.mean(); x=(t-tm)/(t.max()-t.min())
        cols=[x**k for k in range(3)]
        for h in range(1,4):
            for a in [np.sin,np.cos]:
                b=a(2*np.pi*h*(t-tm)/PROT); cols+= [b, b*x]
        # also fit P_rot itself? use fixed; refine by scanning
        best=None
        for P in np.arange(5.6,6.7,0.02):
            cc=[x**k for k in range(3)]
            for h in range(1,4):
                for a in [np.sin,np.cos]:
                    b=a(2*np.pi*h*(t-tm)/P); cc+=[b,b*x]
            d,e,rr,m,_=joint(t,y,cc,TC,DUR)
            if best is None or np.std(rr)<best[0]: best=(np.std(rr),P,d,e,rr,m,cc)
        rms,P,d,e,rr,m,cc=best
        # red-noise: slide the trapezoid over residuals
        sl=[]
        for tc in np.arange(t.min()+0.3,t.max()-0.3,0.05):
            if abs(tc-TC)<0.5: continue
            dd,_,_,_,_=joint(t,y,cc,tc,DUR); sl.append(dd)
        sl=np.array(sl); semp=1.4826*np.median(np.abs(sl-np.median(sl)))
        res["harm_orbit1"]=dict(P=round(P,3),depth=round(d*1e3,3),sig_white=round(e*1e3,3),sig_emp=round(semp*1e3,3),rms_ppt=round(rms*1e3,3),
            n_slid=len(sl),frac_deeper=round(float((sl>=d).mean()),3),frac_brighter=round(float((sl<=-d).mean()),3))
        # (c) recentre on residual (add back dip)
        s0=trapezoid(t,TC,DUR); base=m+d*s0; resid=y-base
        grid=[]
        for tc in np.arange(TC-0.4,TC+0.41,0.01):
            for dur in np.arange(2,16.1,1)/24:
                s=trapezoid(t,tc,dur); A=np.vstack([-s]+cc).T; c,*_=np.linalg.lstsq(A,y,rcond=None)
                grid.append((np.sum((y-A@c)**2),tc,dur*24,c[0]*1e3))
        grid.sort(); res["recentre"]=dict(tc=round(grid[0][1],3),dur_h=grid[0][2],depth=round(grid[0][3],3),dchi2_vs_none=None)
        out[key]=res; print(key,json.dumps(res))
        if key=="TESS-SPOC_SAP_FLUX":
            ww=np.abs(t-TC)<3
            axs[0].plot(t[ww],y[ww]*1e3,',k'); axs[0].plot(t[ww],(m+d*s0)[ww]*1e3-0,'-',color='0.6'); axs[0].plot(t[ww],(base)[ww]*1e3,'r-',lw=1)
            axs[0].axvspan(TC-DUR/2,TC+DUR/2,color='orange',alpha=.2); axs[0].set_title(f'S67 TESS-SPOC SAP and harmonic model (P={P:.2f} d)')
            tb=np.arange(t.min(),t.max(),1/48); idx=np.digitize(t,tb)
            rb=np.array([np.mean(resid[idx==i]) if (idx==i).sum()>2 else np.nan for i in range(1,len(tb))])
            axs[1].plot(t,resid*1e3,',',color='0.6'); axs[1].plot(tb[:-1]+1/96,rb*1e3,'k.-',ms=3); axs[1].axvspan(TC-DUR/2,TC+DUR/2,color='orange',alpha=.2)
            axs[1].set_ylim(-5,5); axs[1].set_title('residual (dip not subtracted), 30-min bins, orbit 1'); axs[1].axhline(0,color='b')
            axs[2].hist(sl*1e3,50,color='0.6'); axs[2].axvline(d*1e3,color='r'); axs[2].set_title('8 h trapezoid depth slid over orbit 1 residuals; red = event')
fig.tight_layout(); fig.savefig("figs/step2_model.png",dpi=90)
json.dump(out,open("data/step2_model.json","w"),indent=1)
