"""Quality flags, gaps, background and centroid (jitter) around both epochs; Gaia neighbours' required eclipse depth."""
import numpy as np, json
from astropy.table import Table
from lcio import load_all
out={}
for sec,tc in [(65,3084.74),(97,3979.76)]:
    r=load_all(sectors=[sec])[0]; t=r["t"]; q=r["q"]
    w=np.abs(t-tc)<0.5; ev=np.abs(t-tc)<0.125
    bits={}
    for b in range(32):
        n=int(((q[w]>>b)&1).sum())
        if n: bits[b]=n
    tt=t[np.isfinite(t)]; gaps=[(float(tt[i]),float(tt[i+1])) for i in np.where(np.diff(tt)>0.1)[0]]
    near=[gp for gp in gaps if abs(gp[0]-tc)<2 or abs(gp[1]-tc)<2]
    bk=r.get("SAP_BKG"); f=r["SAP_FLUX"]
    oot=(np.abs(t-tc)>0.2)&(np.abs(t-tc)<1)&(q==0)
    d=dict(frac_q0_in_event=float((q[ev]==0).mean()),bits_within_0p5d=bits,gaps_within_2d=near,
           bkg_event_minus_oot=float(np.nanmedian(bk[ev&(q==0)])-np.nanmedian(bk[oot])) if bk is not None else None,
           bkg_oot_level=float(np.nanmedian(bk[oot])) if bk is not None else None, sap_oot_level=float(np.nanmedian(f[oot])))
    for c in ["SAP_X","SAP_Y"]:
        if c in r:
            x=r[c]; d[c+"_rms_ratio_in_out"]=float(np.nanstd(np.diff(x[ev&(q==0)]))/np.nanstd(np.diff(x[oot])))
            d[c+"_shift_mpx"]=float((np.nanmedian(x[ev&(q==0)])-np.nanmedian(x[oot]))*1e3)
    out[f"S{sec}"]=d; print(sec,d)
g=Table.read("data/gaia_2arcmin.csv"); G=np.array(g["phot_g_mean_mag"])
D=3.3e-3; rows=[]
for i in range(1,len(g)):
    if g["sep"][i]>90: break
    need=D*10**(-0.4*(G[0]-G[i]))
    rows.append(dict(source_id=int(g["source_id"][i]),sep=round(float(g["sep"][i]),1),G=round(float(G[i]),2),required=round(float(need),3) if need<1 else "impossible"))
    print(rows[-1])
out["neighbours_required_depth_for_3.3ppt"]=rows
json.dump(out,open("data/step3_flags.json","w"),indent=1)
