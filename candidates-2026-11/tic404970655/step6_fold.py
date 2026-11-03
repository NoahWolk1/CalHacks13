"""Fold SPOC SAP S28-39 on the OGLE period (per-sector normalisation, eclipses masked for a 2 d running-median
detrend of the star's slow variability), refine the epoch and secondary phase from TESS, measure the eclipse
depths/durations, and derive e cos(w), e sin(w) and what the secondary eclipse says about the companion."""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, json
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
from lcio import load_all
P,E0,SPH=20.1104183,3000.2755,0.3232
T=[];Fl=[]
for r in load_all():
    if r['author']!='SPOC': continue
    g=(r['q']==0)&np.isfinite(r['SAP_FLUX']); t=r['t'][g]; f=r['SAP_FLUX'][g]/np.nanmedian(r['SAP_FLUX'][g])
    ph=((t-E0)/P)%1
    mask=(np.minimum(ph,1-ph)<0.045)|(np.abs(ph-SPH)<0.02)
    # running median (2 d) of out-of-eclipse flux, interpolated
    tr=np.array([np.median(f[~mask][np.abs(t[~mask]-x)<1.0]) if (np.abs(t[~mask]-x)<1.0).sum()>100 else np.nan for x in t[::30]])
    ok=np.isfinite(tr); trend=np.interp(t,t[::30][ok],tr[ok])
    T.append(t); Fl.append(f/trend)
t=np.concatenate(T); f=np.concatenate(Fl)
out={}
def binned(ph,f,w):
    b=np.arange(-0.5,0.5+w,w); i=np.digitize(ph,b); x=[];y=[]
    for k in range(1,len(b)):
        s=i==k
        if s.sum()>20: x.append(ph[s].mean()); y.append(np.median(f[s]))
    return np.array(x),np.array(y)
ph=((t-E0)/P+0.5)%1-0.5
# refine primary/secondary centres: minimise of binned curve with a parabola around minimum
res={}
for lab,c,hw in [("primary",0.0,0.04),("secondary",SPH,0.015)]:
    w=np.abs(ph-c)<hw; x,y=binned(ph[w]-c,f[w],0.0005)
    j=np.argmin(y); s=np.abs(x-x[j])<hw/4; cc=np.polyfit(x[s],y[s],2); xm=-cc[1]/(2*cc[0])
    depth=1-np.polyval(cc,xm)
    # duration: where binned flux drops below 1 - 0.1*depth  (first/last contact proxy)
    below=x[(1-y)>0.1*depth]
    res[lab]=dict(phase=round(c+xm,5),dt_vs_OGLE_h=round(xm*P*24,2),depth_ppt=round(depth*1e3,1),
                  dur_10pct_h=round((below.max()-below.min())*P*24,1) if len(below) else None)
out.update(res)
dphi=res["secondary"]["phase"]-res["primary"]["phase"]; out["sec_minus_prim_phase"]=round(dphi,5)
ecosw=np.pi/2*(dphi-0.5); out["e_cos_w"]=round(ecosw,3)
Dp,Ds=res["primary"]["dur_10pct_h"],res["secondary"]["dur_10pct_h"]
esinw=(Ds-Dp)/(Ds+Dp); out["e_sin_w_approx"]=round(esinw,3); out["e_min"]=round(float(np.hypot(ecosw,esinw)),3)
# companion: a planet's secondary eclipse (reflected/thermal light) is << 1 ppt; here Ds ~ Dp
out["secondary_to_primary_depth"]=round(res["secondary"]["depth_ppt"]/res["primary"]["depth_ppt"],2)
print(json.dumps(out,indent=1)); json.dump(out,open("data/step6_fold.json","w"),indent=1)
fig,ax=plt.subplots(1,3,figsize=(16,4.5))
x,y=binned(ph,f,0.001); ax[0].plot(ph,f,',',color='0.7'); ax[0].plot(x,y,'k.',ms=3); ax[0].set_ylim(0.93,1.03); ax[0].set_xlabel(f'phase, P={P} d (OGLE)'); ax[0].set_title('SPOC SAP S28-39, detrended')
for a,(lab,c,hw) in zip(ax[1:],[("primary",res["primary"]["phase"],0.06),("secondary",res["secondary"]["phase"],0.03)]):
    w=np.abs(ph-c)<hw; x,y=binned(ph[w]-c,f[w],0.0005); a.plot((ph[w]-c)*P*24,f[w],',',color='0.7'); a.plot(x*P*24,y,'k.-',ms=3); a.set_ylim(0.93,1.02); a.set_xlabel('hours'); a.set_title(f"{lab}: {res[lab]['depth_ppt']} ppt, ~{res[lab]['dur_10pct_h']} h")
    a.axvspan(-4,4,color='orange',alpha=.15)
fig.tight_layout(); fig.savefig("figs/step6_fold.png",dpi=90)
