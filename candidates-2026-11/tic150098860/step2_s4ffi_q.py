import warnings; warnings.filterwarnings("ignore")
import numpy as np, glob, lightkurve as lk
tpf=lk.read(glob.glob("data/tesscut/**/tess-s0004*.fits", recursive=True)[0]); t=tpf.time.value; q=tpf.quality
m=np.abs(t-1417.1)<0.6
for a,b in zip(t[m],q[m]): print(round(a,3),b,end="; ")
print(); print("unique q in S4 orbit1:",np.unique(q[t<1418.6],return_counts=True))
