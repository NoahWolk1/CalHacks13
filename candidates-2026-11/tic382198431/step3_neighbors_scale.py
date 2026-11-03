"""Does the same-time dip on neighbours scale like an additive (background) error? Convert each star's depth to the
equivalent deficit in units of the target's flux (depth_i * F_i/F_target, F from Tmag) and compare with the target."""
import json, numpy as np, sys
S=sys.argv[1]; tic=json.load(open("data/tic.json")); T0=float(tic["Tmag"])
d=json.load(open(f"data/step3_neighbors_S{S}.json"))["stars"]
T=np.array([x["Tmag"] for x in d]); D=np.array([x["depth_ppt"] for x in d]); E=np.array([x["sig"] for x in d])
fr=10**(-0.4*(T-T0)); De=D*fr; Ee=E*fr
w=1/Ee**2; m=np.sum(De*w)/np.sum(w); me=1/np.sqrt(np.sum(w)); chi=np.sum(((De-m)/Ee)**2)
# correlation of fractional depth with magnitude
r=np.corrcoef(T,D)[0,1]
bright=T<12; faint=T>=12
wm=lambda a,e:(np.sum(a/e**2)/np.sum(1/e**2),1/np.sqrt(np.sum(1/e**2)))
out=dict(target_equiv_deficit_ppt=round(m,2),err=round(me,2),chi2=round(chi,1),n=len(d),r_Tmag_depth=round(r,2),
         frac_depth_T_lt_12=[round(x,2) for x in wm(D[bright],E[bright])] if bright.any() else None,
         frac_depth_T_ge_12=[round(x,2) for x in wm(D[faint],E[faint])] if faint.any() else None)
print(out); json.dump(out,open(f"data/step3_neighbors_scale_S{S}.json","w"),indent=1)
