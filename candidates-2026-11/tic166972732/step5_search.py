"""All sectors: 4 h box scan of QLP (KSPSAP/DET) for dips and brightenings (count both); depth of the vet's
3665.55 'secondary' and 3733.28 'brightening' in QLP columns and TARS; the 1449.05 event ranked in the scan;
rotation periodogram (QLP SAP, per sector)."""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, json
from astropy.timeseries import LombScargle
from hlsp import load
from measure import fit_depth
from common import TC, DUR
L=load(); out={}
scan=[]
for r in [r for r in L if r["author"]=="QLP"]:
    t=r["t"]; c="KSPSAP_FLUX" if "KSPSAP_FLUX" in r["cols"] else "DET_FLUX"
    y=r["cols"][c].copy(); y[~r["good"]]=np.nan; y=y/np.nanmedian(y); y[np.abs(y-1)>0.3]=np.nan
    for tc in np.arange(np.nanmin(t)+0.3,np.nanmax(t)-0.3,0.05):
        w=np.abs(t-tc)<0.6
        if np.isfinite(y[w]).sum()<15: continue
        m=fit_depth(t,y,tc,DUR,0.6,2,min_cov=0.8)
        if m and np.isfinite(m.get("depth",np.nan)): scan.append((r["sector"],tc,m["depth"]*1e3,m["sig_white"]*m["beta"]*1e3))
scan=np.array(scan); snr=scan[:,2]/scan[:,3]
def peaks(sign):
    o=np.argsort(-sign*snr); sel=[]
    for i in o:
        if all(abs(scan[i,1]-scan[j,1])>0.5 for j in sel): sel.append(i)
        if len(sel)>=12: break
    return [dict(sector=int(scan[i,0]),t=round(scan[i,1],3),depth_ppt=round(scan[i,2],2),sig=round(scan[i,3],2),snr=round(snr[i],1)) for i in sel]
out["top_dips"]=peaks(1); out["top_brightenings"]=peaks(-1)
print("top dips"); [print("  ",x) for x in out["top_dips"]]
print("top brightenings"); [print("  ",x) for x in out["top_brightenings"]]
# independent extrema counting above thresholds
for thr in [4,5,6]:
    nd=sum(1 for x in peaks(1) if x["snr"]>thr); nb=sum(1 for x in peaks(-1) if x["snr"]<-thr)
    out[f"n_above_{thr}"]=dict(dips=nd,brightenings=nb); print("SNR >",thr,": dips",nd,"brightenings",nb,"(of top 12 each)")
# vet's other events, every product
ev={}
for name,tc in [("main",TC),("vet_secondary",3665.55),("vet_brightening",3733.28)]:
    for r in L:
        t=r["t"]
        if not (np.nanmin(t)<tc<np.nanmax(t)): continue
        for c,y0 in r["cols"].items():
            if any(s in c for s in ["BKG","_X","_Y","CENTROID","background"]): continue
            y=y0.copy(); y[~r["good"]]=np.nan; w=np.abs(t-tc)<0.6
            if np.isfinite(y[w]).sum()<15: continue
            y=y/np.nanmedian(y[w]); y[np.abs(y-1)>0.3]=np.nan
            m=fit_depth(t,y,tc,DUR,0.6,2,min_cov=0.3)
            if m and np.isfinite(m.get("depth",np.nan)):
                ev[f"{name} {r['author']} {c}"]=[round(m["depth"]*1e3,2),round(m["sig_white"]*m["beta"]*1e3,2)]
for k,v in ev.items(): print(k,v)
out["events"]=ev
# rotation
rot=[]
for r in [r for r in L if r["author"]=="QLP"]:
    t=r["t"]; y=r["cols"]["SAP_FLUX"].copy(); g=r["good"]&np.isfinite(y)
    if g.sum()<200: continue
    f,p=LombScargle(t[g],y[g]/np.nanmedian(y[g])).autopower(minimum_frequency=1/14,maximum_frequency=2,samples_per_peak=10)
    i=np.argmax(p); amp=np.sqrt(p[i])*np.std(y[g]/np.nanmedian(y[g]))*np.sqrt(2)
    rot.append(dict(sector=r["sector"],P=round(1/f[i],2),power=round(float(p[i]),3),amp_ppt=round(float(amp)*1e3,1),rms_ppt=round(float(np.std(y[g]/np.nanmedian(y[g])))*1e3,1)))
out["rotation"]=rot
for x in rot: print(x)
json.dump(out,open("data/step5_search.json","w"),indent=1)
