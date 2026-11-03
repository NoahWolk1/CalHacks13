"""PDC correction (PDCSAP/SAP, each normalised) around the event, 2-h bins, plus the S96 QLP vs SPOC SAP ratio."""
import numpy as np, matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
from lcio import load_all
from common import TC, DUR
L={(r['author'],r['sector']):r for r in load_all()}
r=L[('SPOC',96)]; g=(r['q']==0)&np.isfinite(r['PDCSAP_FLUX'])
t=r['t'][g]; ratio=(r['PDCSAP_FLUX'][g]/np.nanmedian(r['PDCSAP_FLUX'][g]))/(r['SAP_FLUX'][g]/np.nanmedian(r['SAP_FLUX'][g]))
w=np.abs(t-TC)<2.5
tb=np.arange(TC-2.5,TC+2.5,1/12); rb=np.array([np.nanmean(ratio[(t>=a)&(t<a+1/12)]) if ((t>=a)&(t<a+1/12)).sum()>10 else np.nan for a in tb])
inb=np.abs(t-TC)<DUR/2; side=(np.abs(t-TC)>0.5)&(np.abs(t-TC)<1.5)&(t>3914.4)
print("PDC correction in box minus +-0.5-1.5 d: %.3f ppt"%((np.nanmean(ratio[inb])-np.nanmean(ratio[side]))*1e3))
for a,b in zip(tb,rb): 
    if abs(a-TC)<1.6: print(f"  {a:.2f} {(b-1)*1e3:+.3f}")
plt.figure(figsize=(10,4)); plt.plot(tb+1/24,(rb-1)*1e3,'o-'); plt.axvspan(TC-DUR/2,TC+DUR/2,color='y',alpha=.3); plt.ylabel("PDCSAP/SAP - 1 [ppt]"); plt.title("S96 PDC correction around the event")
plt.savefig("figs/step2_pdc_correction.png",dpi=100)
