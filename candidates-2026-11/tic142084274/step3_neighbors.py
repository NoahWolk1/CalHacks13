"""Same-time dips on other stars: QLP S12 light curves of stars on camera 4 CCD 1 near the target."""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, json, lightkurve as lk
from astropy.io import fits
from measure import measure
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
TC=1635.158; DUR=2/24
sr=lk.search_lightcurve("98.1218351995239 -74.8543913275968", radius=3600, author="QLP", sector=12)
print("QLP S12 LCs within 1 deg:",len(sr))
tab=sr.table; order=np.argsort(np.array(tab["distance"])); sr=sr[order]
rows=[]; curves=[]
for i in range(min(len(sr),45)):
    tn=str(sr.table["target_name"][i])
    if tn=="142084274": continue
    try:
        lc=sr[i].download(download_dir="data/lc_neighbor")
        f=lc.meta.get("FILENAME") or lc.filename
        h=fits.open(f); d=h[1].data; hd=h[0].header
        if hd["CCD"]!=1 or hd["CAMERA"]!=4: continue
        t=np.array(d["TIME"],float); q=np.array(d["QUALITY"]); y=np.array(d["SAP_FLUX"],float); b=np.array(d["SAP_BKG"],float)
        ok=np.isin(q,[0]); yy=y.copy(); yy[~ok]=np.nan
        m=measure(t,yy,TC,DUR,1.0,1)
        if m is None or not np.isfinite(m.get("depth",np.nan)): continue
        col=np.nanmedian(np.array(d["SAP_X"],float)); row=np.nanmedian(np.array(d["SAP_Y"],float))
        j=np.argmin(np.abs(t-1635.1368))
        loc=np.abs(t-TC)<1
        rows.append(dict(tic=tn,tmag=float(hd.get("TESSMAG",np.nan)),sep_arcsec=float(sr.table["distance"][i]),col=round(col,1),row=round(row,1),
             depth=round(m['depth']*1e3,2),sig=round(m['sig_adopt']*1e3,2),cad1635137_ppt=round((y[j]/np.nanmedian(y[loc])-1)*1e3,1),
             bkg1635137_minus_med=round(b[j]-np.nanmedian(b[loc]),1),q1635137=int(q[j])))
        curves.append((tn,t,y,q,rows[-1]))
        print(rows[-1])
    except Exception as e: print("ERR",tn,e)
json.dump(rows,open("data/step3_neighbors.json","w"),indent=1)
d=np.array([r["depth"]/r["sig"] for r in rows]); print("N stars",len(rows),"depth/sig median",np.median(d),"n >3 sigma",(d>3).sum())
c=np.array([r["cad1635137_ppt"] for r in rows]); print("cadence 1635.137 deviation (ppt) across stars: median",np.median(c),"n<-10",(c<-10).sum())
bb=np.array([r["bkg1635137_minus_med"] for r in rows]); print("bkg excursion at 1635.137 across stars: median",np.median(bb))
fig,ax=plt.subplots(figsize=(10,8))
for k,(tn,t,y,q,r) in enumerate(sorted(curves,key=lambda c:-c[4]["col"])[:16]):
    w=(np.abs(t-TC)<1)&(q==0); ax.plot(t[w],(y[w]/np.nanmedian(y[w])-1)*1e3-40*k,'.',ms=2)
    ax.text(TC+1.02,-40*k,f"TIC {tn} T={r['tmag']:.1f} col {r['col']:.0f}: {r['depth']}±{r['sig']}",fontsize=6,va='center')
ax.axvspan(TC-DUR/2,TC+DUR/2,color='orange',alpha=.3); ax.set_xlim(TC-1,TC+1.9); ax.set_ylim(-40*16,40)
ax.set_xlabel("BTJD"); ax.set_ylabel("QLP SAP [ppt], offset"); ax.set_title("QLP S12, other stars on cam 4 CCD 1 (sorted by column, edge first)")
plt.tight_layout(); plt.savefig("figs/neighbors_s12.png",dpi=110)
