import numpy as np, matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
from common import TC, DUR
fig,ax=plt.subplots(2,1,figsize=(12,7),sharex=True)
for a,col in zip(ax,["PDCSAP_FLUX","SAP_FLUX"]):
    t,r,s=np.load(f"data/prewhiten_resid_{col}.npy")
    m=abs(t-TC)<4; t=t[m]; r=r[m]
    e=np.arange(t.min(),t.max(),1/24.); i=np.digitize(t,e)
    tb=np.array([t[i==k].mean() for k in np.unique(i)]); rb=np.array([r[i==k].mean() for k in np.unique(i)])
    a.plot(t,r*1e3,',',c='0.7'); a.plot(tb,rb*1e3,'o-',ms=3); a.axvspan(TC-DUR/2,TC+DUR/2,color='y',alpha=.3); a.set_ylim(-2.5,2.5); a.set_title(col+" after prewhitening 40 frequencies (S93-97)"); a.axhline(0,c='k',lw=.5); a.axhline(-0.647,c='r',ls=':')
plt.savefig("figs/step2_prewhitened_window.png",dpi=110)
