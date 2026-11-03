"""OGLE-IV Collection of Variable Stars (Glowacki+2025): eclipsing + ellipsoidal binaries within 2' of the target.
Predicts each EB's eclipse times at the TESS event and gives the depth it would need to make the TESS dip."""
import numpy as np, json, sys
from common import RA, DEC, TC
D="data/ogle/" if len(sys.argv)<2 else sys.argv[1]
ident={}
for l in open(D+"ident.dat"):
    id_=l[:18].strip(); h,m,s=float(l[24:26]),float(l[27:29]),float(l[30:35]); sg=-1 if l[36]=='-' else 1
    dd,dm,ds=float(l[37:39]),float(l[40:42]),float(l[43:47]); ident[id_]=(l[20:23].strip(),15*(h+m/60+s/3600),sg*(dd+dm/60+ds/3600))
par={}
for f in ["ecl.dat","ell.dat"]:
    for l in open(D+f):
        p=l.split(); fl=lambda x: None if x in ('-','') else float(x)
        p+=['-']*(7-len(p)); par[p[0]]=dict(I=fl(p[1]),V=fl(p[2]),P=fl(p[3]),T0=fl(p[4]),d1=fl(p[5]),d2=fl(p[6]))
out=[]
for k,(sub,ra,dec) in ident.items():
    sep=np.hypot((ra-RA)*np.cos(np.radians(DEC)),dec-DEC)*3600
    if sep<120:
        p=par.get(k,{}); rec=dict(id=k,sub=sub,sep=round(sep,1),**p)
        if p and p.get('P') and p.get('T0'):
            tbjd=TC+2457000; ph=((tbjd-p['T0'])/p['P'])%1; rec['phase_at_event']=round(ph,3)
        out.append(rec)
out.sort(key=lambda r:r['sep'])
for r in out: print(r)
json.dump(out,open("data/step7_ogle.json","w"),indent=1)
