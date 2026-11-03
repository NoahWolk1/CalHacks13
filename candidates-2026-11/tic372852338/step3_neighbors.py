"""Same-time dips on other stars: QLP light curves (same sector, same camera/CCD) of up to 25 stars within 30',
4 h box depth (measure.py, KSPSAP and SAP) at the event time(s). Usage: step3_neighbors.py SECTOR TC [TC...]"""
import warnings; warnings.filterwarnings("ignore")
import sys, numpy as np, json, lightkurve as lk
from astropy.io import fits
from measure import fit_depth
from common import RA, DEC, TIC, DUR
s=int(sys.argv[1]); TCS=[float(x) for x in sys.argv[2:]]
sr=lk.search_lightcurve(f"{RA} {DEC}", radius=1800, author="QLP", sector=s)
sr=sr[np.argsort(np.array(sr.table["distance"]))]
print("QLP S%d LCs within 30':"%s,len(sr))
rows=[]
for i in range(len(sr)):
    if len(rows)>=25: break
    tn=str(sr.table["target_name"][i])
    if tn==TIC: continue
    try:
        lc=sr[i].download(download_dir="data/lc_neighbor"); f=lc.meta.get("FILENAME") or lc.filename
        h=fits.open(f); d=h[1].data; hd=h[0].header
        t=np.array(d["TIME"],float); q=np.array(d["QUALITY"])
        rec=dict(tic=tn,tmag=float(hd.get("TESSMAG",np.nan)),cam=hd.get("CAMERA"),ccd=hd.get("CCD"),sep_arcmin=round(float(sr.table["distance"][i])/60,1))
        for tc in TCS:
            for c in ["SAP_FLUX","KSPSAP_FLUX"]:
                y=np.array(d[c],float); y[q!=0]=np.nan; w=np.abs(t-tc)<0.6
                if np.isfinite(y[w]).sum()<15: continue
                y=y/np.nanmedian(y[w]); y[np.abs(y-1)>0.3]=np.nan
                m=fit_depth(t,y,tc,DUR,0.6,2,min_cov=0.3)
                if m and np.isfinite(m.get("depth",np.nan)): rec[f"{tc}_{c}"]=[round(m["depth"]*1e3,2),round(m["sig_white"]*m["beta"]*1e3,2)]
        rows.append(rec); print(rec,flush=True)
    except Exception as e: print("ERR",tn,str(e)[:100])
for tc in TCS:
    for c in ["SAP_FLUX","KSPSAP_FLUX"]:
        v=np.array([r[f"{tc}_{c}"] for r in rows if f"{tc}_{c}" in r])
        if len(v): print(tc,c,"N",len(v),"median depth",np.median(v[:,0]),"median depth/sig",np.median(v[:,0]/v[:,1]),"n>3sig",(v[:,0]/v[:,1]>3).sum(),"n< -3sig",(v[:,0]/v[:,1]<-3).sum())
json.dump(rows,open(f"data/step3_neighbors_s{s}.json","w"),indent=1)
