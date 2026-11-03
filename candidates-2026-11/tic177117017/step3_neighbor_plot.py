import warnings; warnings.filterwarnings("ignore")
import glob, numpy as np, json
from astropy.io import fits
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
from measure import measure
EV={"1385.094":(1385.094,0.125),"1389.59":(1389.59,0.25),"1391.135":(1391.135,0.283),"1394.01":(1394.01,0.2)}
files=sorted(glob.glob("data/lc_neighbor/**/*.fits",recursive=True))+glob.glob("data/lc/**/*qlp*s0003*.fits",recursive=True)
files=[f for f in files if "s0003" in f]
res={}
fig,ax=plt.subplots(len(files),1,figsize=(13,1.3*len(files)),sharex=True)
for a,f in zip(ax,files):
    h=fits.open(f); d=h[1].data; hd=h[0].header
    t=np.array(d["TIME"],float); k=np.array(d["KSPSAP_FLUX"],float); q=np.array(d["QUALITY"],int); b=np.array(d["SAP_BKG"],float)
    tic=hd["TICID"]; cam,ccd,tm=hd["CAMERA"],hd["CCD"],hd.get("TESSMAG")
    row={"cam":cam,"ccd":ccd,"Tmag":tm}
    for n,(tc,du) in EV.items():
        m=measure(t,k.copy(),tc,du,win=1.0,order=2)
        row[n]=None if m is None or not np.isfinite(m.get("depth",np.nan)) else [round(m["depth"]*1e3,1),round(m["sig_adopt"]*1e3,1)]
    res[str(tic)]=row
    w=(t>1383.5)&(t<1396.5)
    a.plot(t[w&(q==0)],k[w&(q==0)],"k.",ms=1.5); a.plot(t[w&(q!=0)],k[w&(q!=0)],"r.",ms=1.5)
    a.set_ylim(0.9,1.05); a.text(0.01,0.1,f"TIC {tic} cam{cam} ccd{ccd} T={tm:.1f}" + ("  <-- TARGET" if tic==177117017 else ""),transform=a.transAxes,fontsize=7)
    for n,(tc,du) in EV.items(): a.axvspan(tc-du/2,tc+du/2,color="orange",alpha=.3)
ax[-1].set_xlabel("BTJD"); fig.suptitle("QLP KSPSAP, sector 3: target vs other stars (red = flagged)")
fig.tight_layout(); fig.savefig("figs/s3_qlp_neighbors.png",dpi=90)
print(json.dumps(res,indent=0)); json.dump(res,open("data/step3_neighbors.json","w"),indent=1)
