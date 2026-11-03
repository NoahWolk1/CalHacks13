"""Luminosity and size of the (combined) LMC host, and the companion size implied by the depth if it were a dark body."""
import numpy as np, json
G=13.2935; DM=18.477; out={}
for lab,AG,T,BC in [("GSP-Phot",0.797,24504.,-2.35),("ESP-HS",0.668,20579.,-2.0)]:
    MG=G-DM-AG; Mbol=MG+BC; L=10**((4.74-Mbol)/2.5); R=np.sqrt(L)*(5772/T)**2
    out[lab]=dict(M_G=round(MG,2),BC=BC,logL=round(np.log10(L),2),R_combined_sun=round(R,1))
out["gspphot_radius_rescaled_to_LMC"]=round(4.453*49590/9490.1,1)
R=np.mean([out[k]["R_combined_sun"] for k in ("GSP-Phot","ESP-HS")]); out["R_adopt_if_single"]=round(R,1)
for d in [16.3,36.8,41.1]:
    k=np.sqrt(d*1e-3); out[f"dark_body_for_{d}ppt"]=dict(R_sun=round(k*R,2),R_jup=round(k*R*9.73,1))
# eclipse duration check: P=20.11 d, M_tot ~ 2x15 Msun
a=(6.674e-8*30*1.989e33*(20.11*86400)**2/(4*np.pi**2))**(1/3)/6.957e10; out["a_Rsun_for_Mtot30"]=round(a,0)
print(json.dumps(out,indent=1)); json.dump(out,open("data/step6_size.json","w"),indent=1)
