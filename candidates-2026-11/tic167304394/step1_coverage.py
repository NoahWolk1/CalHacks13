import warnings; warnings.filterwarnings("ignore")
import numpy as np
from lcio import load_all
from common import EV, BRIGHT
L=load_all(); evs=list(EV.values())+[BRIGHT]
print(L[0]["cols"])
for r in sorted(L,key=lambda r:r["sector"]):
    t=r["t"]; tf=t[np.isfinite(t)]
    hit=[e for e in evs if tf.min()-0.5<e<tf.max()+0.5]
    print(r["sector"],r["author"],r["camera"],r["ccd"],round(tf.min(),2),round(tf.max(),2),len(t),"q0:",(r["q"]==0).sum(), "EVENTS:"+str(hit) if hit else "")
