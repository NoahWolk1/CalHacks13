"""Same-time check between the two sweep targets that share camera 4 / CCD 1 in S29 (TIC 382198431 and TIC 149572699):
depth of each star's QLP SAP at the other's event times, and at the S29 times of each other's top dips."""
import warnings, json; warnings.filterwarnings("ignore")
import numpy as np, glob
from astropy.io import fits
from measure import measure
out=[]
for tic,d in [("382198431","../tic382198431"),("149572699","../tic149572699")]:
    f=glob.glob(f"{d}/data/lc/**/hlsp_qlp_tess_ffi_s0029*{int(tic):016d}*.fits",recursive=True)[0]
    h=fits.open(f); D=h[1].data; t=D["TIME"]; q=D["QUALITY"]; y=np.array(D["SAP_FLUX"],float); y[q!=0]=np.nan
    print(tic,"S29 cam",h[0].header["CAMERA"],"ccd",h[0].header["CCD"])
    for tc,dur in [(2096.549,4/24),(2098.316,4/24),(2096.536,4/24)]:
        r=measure(t,y,tc,dur)
        out.append(dict(tic=tic,tc=tc,dur_h=dur*24,depth_ppt=round(r["depth"]*1e3,2),sig=round(r["sig_adopt"]*1e3,2)))
        print(out[-1])
json.dump(out,open("data/step3_crosscheck.json","w"),indent=1)
