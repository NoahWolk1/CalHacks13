"""Period tests on all sectors S1-S98 using the 8 h depth grid.
(1) the vet's P = 106.8732 d anchored at 1416.784; (2) duo aliases P = 909.078/n, n = 1..80.
Per epoch and product family: depth at nearest grid tc, sigma = max(white*beta, per-LC empirical scatter).
'excluded' = depth + 3 sigma < 1.14 ppt in the best raw (SAP) product; 'dip' = depth > 3 sigma."""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, pickle, json
G=pickle.load(open("data/depthgrid.pkl","rb"))
DEP=1.14e-3; T1,T2=1416.784,2325.862
PREF_SAP=[("SPOC","SAP_FLUX"),("TESS-SPOC","SAP_FLUX"),("QLP","SAP_FLUX")]
PREF_PDC=[("SPOC","PDCSAP_FLUX"),("TESS-SPOC","PDCSAP_FLUX"),("QLP","KSPSAP_FLUX"),("QLP","DET_FLUX")]
def at(tc, pref):
    for a,c in pref:
        for (s,au,co),g in G.items():
            if au!=a or co!=c: continue
            if not (g["grid"][0]<=tc<=g["grid"][-1]): continue
            i=int(np.argmin(np.abs(g["grid"]-tc)))
            if abs(g["grid"][i]-tc)>0.011 or g["cov"][i]<0.5 or not np.isfinite(g["depth"][i]): continue
            sig=np.nanmax([g["sig"][i],g["sig_emp"]])
            return dict(sector=s,prod=f"{a} {c.replace('_FLUX','')}",depth=round(g["depth"][i]*1e3,2),sig=round(sig*1e3,2),cov=round(g["cov"][i],2))
    return None
def epochs(T0,P):
    lo,hi=1320,4050
    return [T0+k*P for k in range(int(np.ceil((lo-T0)/P)),int(np.floor((hi-T0)/P))+1)]
out={}
# (1) vet period
rows=[]
for tc in epochs(T1,106.8732):
    rows.append(dict(tc=round(tc,3),SAP=at(tc,PREF_SAP),PDC=at(tc,PREF_PDC)))
out["P106.8732"]=rows
print("P = 106.8732 d, T0 = 1416.784")
for r in rows:
    if r["SAP"] or r["PDC"]: print(" ",r)
    else: print("  ",r["tc"],"no data")
# also check the ephemeris timing uncertainty: scan +-0.5 d around each covered epoch for the deepest PDC/SAP dip
# (2) duo aliases
summ=[]
for n in range(1,81):
    P=(T2-T1)/n; ep=epochs(T1,P); cov=0; exc=0; dip=0; amb=0; exc_list=[]
    for k,tc in enumerate(ep):
        if abs(tc-T1)<0.05 or abs(tc-T2)<0.05: continue
        m=at(tc,PREF_SAP)
        if m is None: continue
        cov+=1
        if m["depth"]+3*m["sig"]<DEP*1e3: exc+=1; exc_list.append(round(tc,2))
        elif m["depth"]>3*m["sig"]: dip+=1
        else: amb+=1
    summ.append(dict(n=n,P=round(P,3),epochs_with_data=cov,excluded=exc,dip=dip,ambiguous=amb,survives=(exc==0),first_excluding=exc_list[:3]))
out["duo_aliases"]=summ
surv=[s for s in summ if s["survives"]]
print("\nduo aliases surviving (no SAP epoch excludes 1.14 ppt):",[(s["n"],s["P"],s["epochs_with_data"]) for s in surv])
print("n=1..10:"); [print(" ",s) for s in summ[:10]]
json.dump(out,open("data/step5_aliases.json","w"),indent=1,default=float)
