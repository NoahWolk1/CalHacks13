"""Secondary-eclipse candidates: per-epoch box depths at the phases of the deepest folded boxes, and a phase-scan figure."""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, json
T,F,S=np.load("data/detrended_sap.npy"); g=np.isfinite(F); T,F,S=T[g],F[g],S[g]
fo=json.load(open("data/step5_fold.json")); T0=fo["ephem"]["T0"]; P=fo["ephem"]["P"]
ph=((T-T0)/P+0.5)%1-0.5; mask=np.abs(ph*P)>0.2
dur=3.4/24
res=[]
for c in np.arange(-0.5,0.5,0.001):
    m=mask&(np.abs(((ph-c)+0.5)%1-0.5)<dur/2/P)
    if m.sum()>20: res.append((c,-np.mean(F[m])*1e3))
res=np.array(res)
# independent (non-overlapping) boxes for the noise
ind=res[::int(round(dur/P/0.001))]
sr=1.4826*np.median(np.abs(ind[:,1]-np.median(ind[:,1])))
top=np.argsort(-res[:,1])[:40]; peaks=[]
for i in top:
    if all(abs(res[i,0]-p[0])>0.02 for p in peaks): peaks.append(res[i])
print("independent-box robust sigma",round(sr,3),"ppt; N independent",len(ind))
out=dict(sigma_ppt=sr,peaks=[])
for c,d in peaks[:4]:
    print(f"phase {c:.3f}: {d:.2f} ppt = {d/sr:.1f} sigma")
    per=[]
    for k in range(-40,80):
        tc=T0+(k+c)*P; m=np.abs(T-tc)<dur/2
        if m.sum()>5:
            oo=(np.abs(T-tc)>dur)&(np.abs(T-tc)<0.6)
            per.append((int(S[m][0]),round(tc,2),round(-(np.mean(F[m])-np.mean(F[oo]))*1e3,2)))
    print("   per epoch (sector, t, ppt):",per)
    out["peaks"].append(dict(phase=c,depth_ppt=d,z=d/sr,per_epoch=per))
j=np.argmin(np.abs(np.abs(res[:,0])-0.5)); print("phase 0.5:",res[j]); out["phase05_ppt"]=res[j,1]
json.dump(out,open("data/step5_secondary.json","w"),indent=1,default=float)
