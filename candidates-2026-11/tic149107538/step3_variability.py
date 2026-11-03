"""Rotation: Lomb-Scargle per sector (TESS-SPOC/SPOC SAP, QLP SAP), amplitude, and the phase of the event."""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, json
from astropy.timeseries import LombScargle
from lcio import load_all
from common import TC
out=[]
for r in load_all(authors=["TESS-SPOC","SPOC","QLP"]):
    t=r['t']; f=r['SAP_FLUX']; g=(r['q']==0)&np.isfinite(f)&np.isfinite(t)
    if g.sum()<200: continue
    t=t[g]; y=f[g]/np.nanmedian(f[g])-1
    fr=np.linspace(0.02,3,6000); p=LombScargle(t,y).power(fr)
    P=1/fr[np.argmax(p)]
    lo,hi=np.percentile(y,[2,98])
    out.append(dict(author=r['author'],sector=int(r['sector']),P_best=round(float(P),3),p2p_ppt=round(float(hi-lo)*1e3,1)))
    print(out[-1])
# all TESS-SPOC 2023 combined (S61-69)
T=[];Y=[]
for r in load_all(authors=["TESS-SPOC"]):
    t=r['t']; f=r['SAP_FLUX']; g=(r['q']==0)&np.isfinite(f); T+=list(t[g]); Y+=list(f[g]/np.nanmedian(f[g])-1)
T=np.array(T);Y=np.array(Y)
fr=np.linspace(0.02,3,30000); p=LombScargle(T,Y).power(fr); i=np.argsort(p)[::-1]
print("combined S61-69 top peaks (d):",[round(1/fr[j],3) for j in i[:1] ], "power",p[i[0]])
pk=[];
for j in np.argsort(p)[::-1]:
    if all(abs(fr[j]-fr[k])>0.01 for k in pk): pk.append(j)
    if len(pk)==5: break
print([(round(1/fr[j],3),round(float(p[j]),3)) for j in pk])
json.dump(dict(per_sector=out,combined_peaks=[(1/fr[j],float(p[j])) for j in pk]),open("data/step3_variability.json","w"),indent=1)
