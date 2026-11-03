import warnings; warnings.filterwarnings("ignore")
import numpy as np
from lcio import load_all
L=load_all()
EV=[1416.784,2325.862,3150.98,3767.99]
for r in sorted(L,key=lambda r:(r["sector"],r["author"])):
    t=r["t"]; tf=t[np.isfinite(t)]
    hit=[e for e in EV if tf.min()-0.5<e<tf.max()+0.5]
    print(r["sector"],r["author"],r["camera"],r["ccd"],round(tf.min(),2),round(tf.max(),2),len(t), "EVENTS:"+str(hit) if hit else "")
