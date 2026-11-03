"""S65: harmonic model (2.374 d SB1 x3 harmonics + 4.42 d x2) vs the event; injection-recovery; and depth at every SB1 conjunction
in TESS-SPOC SAP S61-69 (raw local baseline vs after the harmonic model) to see whether TC1 stands out."""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, json
from lcio import load_all
from measure import measure, trapezoid
from common import *
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
out={}
recs={r["sector"]:r for r in load_all(authors=["TESS-SPOC"])}
def prep(r,col="SAP_FLUX"):
    t=r["t"]; y=r[col].copy(); ok=np.isfinite(y)&np.isfinite(t)&(r["q"]==0)
    return t[ok],y[ok]/np.nanmedian(y[ok])
def detr(t,y,tc,mask=0.4):
    m=np.abs(t-tc)>mask; return y/harm_fit(t,y,m)
# 1. figure of S65
t,y=prep(recs[65]); mdl=harm_fit(t,y,np.abs(t-TC1)>0.4)
fig,ax=plt.subplots(3,1,figsize=(13,9),sharex=False)
nb=18
def binit(t,y,nb=18):
    n=len(t)//nb; return t[:n*nb].reshape(n,nb).mean(1), y[:n*nb].reshape(n,nb).mean(1)
tb,yb=binit(t,y); ax[0].plot(t,(y-1)*1e3,',',color='0.7'); ax[0].plot(tb,(yb-1)*1e3,'k.',ms=2); ax[0].plot(t,(mdl-1)*1e3,'r-',lw=.8)
cj=conj_times(t.min(),t.max())
for x in cj["prim_behind"]: ax[0].axvline(x,color='b',lw=.5,ls=':')
ax[0].axvline(TC1,color='orange'); ax[0].set_title("S65 TESS-SPOC SAP, 1 h bins; red: 2.374 d (x3) + 4.42 d (x2) harmonic model fitted with ±0.4 d masked; blue: Gaia SB1 conjunctions")
rz=y/mdl; tb,rb=binit(t,rz); ax[1].plot(tb,(rb-1)*1e3,'k.',ms=3); ax[1].axvline(TC1,color='orange'); ax[1].set_ylabel("residual ppt"); ax[1].set_ylim(-3,3)
w=np.abs(t-TC1)<1.5; tb,yb=binit(t[w],y[w],9); _,mb=binit(t[w],mdl[w],9); _,rb=binit(t[w],rz[w],9)
ax[2].plot(tb,(yb-1)*1e3,'k.',label='SAP (30-min bins)'); ax[2].plot(tb,(mb-1)*1e3,'r-',label='harmonic model'); ax[2].plot(tb,(rb-1)*1e3-4,'b.',label='residual - 4')
ax[2].axvspan(TC1-DUR/2,TC1+DUR/2,color='orange',alpha=.2); ax[2].legend(fontsize=7); ax[2].set_xlabel("BTJD")
for a in ax[:2]: a.set_xlabel("BTJD")
plt.tight_layout(); plt.savefig("figs/s65_harmonic_model.png",dpi=110)
# 2. injection-recovery in S65 SAP at TC1 (on top of the real data) and at 30 other epochs
inj={}
for D in [0.0006,0.0011,0.0014]:   # 1.1 ppt = 1.37*0.81 (SPOC aperture dilution of the target's light: CROWDSAP 0.563 => on-target depth 1.37 in PDCSAP ~ 0.77 ppt in SAP)
    rec_tc=[]; rec_raw=[]
    for tci in np.arange(t.min()+1.2,t.max()-1.2,0.61):
        if np.abs(tci-TC1)<1: continue
        yi=y*(1-D*trapezoid(t,tci,DUR,0.15))
        if (np.abs(t-tci)<DUR/2).sum()<0.8*DUR/np.median(np.diff(t)): continue
        r1=measure(t,detr(t,yi,tci),tci,DUR,1.0,2); r0=measure(t,detr(t,y,tci),tci,DUR,1.0,2)
        if r1 is None or not np.isfinite(r1.get("depth",np.nan)): continue
        rec_tc.append((r1["depth"]-r0["depth"])/D)
    inj[f"{D*1e3:.1f}ppt"]=dict(n=len(rec_tc),median_recovered_fraction=float(np.median(rec_tc)),p16=float(np.percentile(rec_tc,16)),p84=float(np.percentile(rec_tc,84)))
    print("injection",D,inj[f"{D*1e3:.1f}ppt"])
out["injection_S65_SAP"]=inj
# 3. 8 h depth at every SB1 conjunction (prim_behind) and at every anti-conjunction, raw local quadratic vs harmonic-model residual
rows=[]
for s,r in sorted(recs.items()):
    t,y=prep(r)
    cj=conj_times(t.min()+0.6,t.max()-0.6)
    for kind in ["prim_behind","prim_front"]:
        for tc in cj[kind]:
            # centre on the light-curve trough within +-0.15 d
            raw=measure(t,y,tc,DUR,1.0,2); res=measure(t,detr(t,y,tc),tc,DUR,1.0,2)
            if raw is None or res is None or not np.isfinite(raw.get("depth",np.nan)) or not np.isfinite(res.get("depth",np.nan)): continue
            rows.append(dict(sector=s,kind=kind,t=round(tc,3),raw=round(raw["depth"]*1e3,2),resid=round(res["depth"]*1e3,2),sig=round(res["sig_white"]*1e3,2)))
for kind in ["prim_behind","prim_front"]:
    R=[x for x in rows if x["kind"]==kind]; raw=np.array([x["raw"] for x in R]); rs=np.array([x["resid"] for x in R])
    print(kind,"N",len(R),"raw median",np.median(raw),"raw max",raw.max(),"resid median",np.median(rs),"resid std",np.std(rs),"resid max",rs.max())
    out[kind]=dict(N=len(R),raw_median=float(np.median(raw)),raw_p90=float(np.percentile(raw,90)),resid_median=float(np.median(rs)),resid_std=float(np.std(rs)),resid_max=float(rs.max()))
R=[x for x in rows if x["kind"]=="prim_behind"]
near=min(R,key=lambda x:abs(x["t"]-TC1)); print("conjunction nearest TC1:",near)
raw=np.array([x["raw"] for x in R]); rs=np.array([x["resid"] for x in R])
print("rank of TC1 conjunction among",len(R),": raw rank",int((raw>=near["raw"]).sum()),", resid rank",int((rs>=near["resid"]).sum()))
out["TC1_conj"]=near; out["TC1_rank_raw"]=int((raw>=near["raw"]).sum()); out["TC1_rank_resid"]=int((rs>=near["resid"]).sum())
out["conj_rows"]=rows
srt=sorted(R,key=lambda x:-x["raw"])[:8]; print("deepest raw conjunction troughs:",srt)
fig,ax=plt.subplots(figsize=(8,4))
ax.hist(raw,bins=25,alpha=.6,label="raw local-quadratic 8 h depth at each conjunction"); ax.hist(rs,bins=25,alpha=.6,label="after harmonic model")
ax.axvline(near["raw"],color='C0',ls='--'); ax.axvline(near["resid"],color='C1',ls='--'); ax.legend(fontsize=7); ax.set_xlabel("ppt (TESS-SPOC SAP, S61-69)")
ax.set_title("8 h box depth at every Gaia SB1 conjunction (dashed: the one at TC1)",fontsize=9)
plt.tight_layout(); plt.savefig("figs/conjunction_depths.png",dpi=110)
json.dump(out,open("data/step2_model.json","w"),indent=1,default=float)
