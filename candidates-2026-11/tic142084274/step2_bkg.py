import warnings; warnings.filterwarnings("ignore")
import numpy as np, json, matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
from lcio import load_all
from measure import measure
TC=1635.158; DUR=2/24
L={r["author"]:r for r in load_all(sectors=[12])}
q=L["QLP"]; e=L["ELEANOR-LITE"]
print("QLP quality values:",{int(v):int((q['q']==v).sum()) for v in np.unique(q['q'])})
print("ELEANOR quality values:",{int(v):int((e['q']==v).sum()) for v in np.unique(e['q'])})
t=q["t"]; f=q["SAP_FLUX"]; b=q["SAP_BKG"]; g=np.isfinite(f)&np.isfinite(b)&(q["q"]==0)
# high-pass both with 1 d running median to look at cadence-level coupling
def hp(t,y,w=0.5):
    o=np.full_like(y,np.nan)
    for i in range(len(t)):
        m=np.abs(t-t[i])<w/2
        o[i]=y[i]-np.nanmedian(y[m])
    return o
fh=hp(t[g],f[g]); bh=hp(t[g],b[g])
fn=fh/np.nanmedian(f[g])
loc=np.abs(t[g]-TC)<1.5
cc=np.corrcoef(fn[loc],bh[loc])[0,1]
A=np.vstack([bh[loc],np.ones(loc.sum())]).T; k=np.linalg.lstsq(A,fn[loc],rcond=None)[0]
print(f"QLP S12 (+-1.5 d) high-passed SAP flux vs SAP_BKG: Pearson r = {cc:.3f}, slope = {k[0]*1e3:.4f} ppt per bkg unit; bkg rms {np.std(bh):.1f}")
res=fn-k[0]*bh
print("flux rms before/after bkg regression (ppt):", np.std(fn)*1e3, np.std(res)*1e3)
# depth of event in decorrelated flux
yd=np.full_like(f,np.nan); yd[g]=np.nanmedian(f[g])*(1+res)
for lab,y in [("QLP SAP (q=0)",np.where(g,f,np.nan)),("QLP SAP bkg-decorrelated",yd)]:
    for o in [1,2]:
        r=measure(t,y,TC,DUR,order=o); print(lab,"order",o,f"depth {r['depth']*1e3:.1f} +- {r['sig_adopt']*1e3:.1f} ppt (white {r['sig_white']*1e3:.1f}, emp {r['sig_emp']*1e3:.1f}), frac deeper {r['frac_deeper']:.3f}")
# per cadence event table
w=np.abs(t-TC)<0.15
print("event cadences: t, flux ppt, bkg - median")
for i in np.where(w&g)[0]:
    j=np.where(np.where(g)[0]==i)[0][0]
    print(f" {t[i]:.4f} {fn[j]*1e3:7.1f} {bh[j]:8.1f}  decorrelated {res[j]*1e3:7.1f}")
# leave-one-out: drop 1635.1368
y2=np.where(g,f,np.nan).copy(); y2[np.argmin(np.abs(t-1635.1368))]=np.nan
r=measure(t,y2,TC,DUR,order=1); print(f"QLP SAP without the single 1635.137 cadence: {r['depth']*1e3:.1f} +- {r['sig_adopt']*1e3:.1f}")
fig,ax=plt.subplots(1,2,figsize=(11,4.5))
ax[0].plot(bh[loc],fn[loc]*1e3,'k.',ms=3,alpha=.6); ww=np.abs(t[g]-TC)<DUR/2*1.3
ax[0].plot(bh[ww],fn[ww]*1e3,'ro',ms=5,label='event cadences')
xx=np.linspace(bh[loc].min(),bh[loc].max(),10); ax[0].plot(xx,k[0]*xx*1e3,'b-',label=f'r={cc:.2f}')
ax[0].set_xlabel("QLP SAP_BKG (high-passed)"); ax[0].set_ylabel("QLP SAP flux (high-passed) [ppt]"); ax[0].legend(); ax[0].set_title("QLP S12: flux vs background, cadences within 1.5 d of event")
m=np.abs(t[g]-TC)<1.5
ax[1].plot(t[g][m],fn[m]*1e3,'.',color='0.6',label='SAP'); ax[1].plot(t[g][m],res[m]*1e3-40,'k.',label='bkg-decorrelated (-40)')
ax[1].plot(t[g][m],bh[m]*k[0]*1e3+40,'b.',label='bkg term (+40)')
ax[1].axvline(TC,color='r',alpha=.3); ax[1].legend(fontsize=7); ax[1].set_xlabel("BTJD"); ax[1].set_ylabel("ppt")
plt.tight_layout(); plt.savefig("figs/qlp_flux_vs_bkg.png",dpi=110)
json.dump(dict(r=cc,slope_ppt_per_unit=k[0]*1e3,rms_before=np.std(fn)*1e3,rms_after=np.std(res)*1e3),open("data/step2_bkg.json","w"),indent=1)
