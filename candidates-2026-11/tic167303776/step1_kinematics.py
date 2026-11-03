"""Galactic UVW from Gaia DR3 (RV 7.3 +/- 4.9 km/s) vs mean UVW of young moving groups (Gagne+2018 BANYAN Sigma means); RV scanned over +/-2 sigma."""
import numpy as np, json
from astropy.coordinates import SkyCoord, Galactic
import astropy.units as u
g=json.load(open("data/step1_gaia.json"))
groups={"TucHor":(-9.8,-20.9,-1.0),"Columba":(-11.9,-21.3,-5.7),"Carina":(-10.7,-21.9,-5.5),"ABDor":(-7.1,-27.2,-13.8),"Argus":(-22.6,-14.6,-5.0),"BetaPic":(-10.9,-16.0,-9.0),"Octans":(-14.5,-3.6,-11.2),"THOR(32Ori)":(-12.8,-18.8,-9.0),"Hyades":(-42.2,-19.0,-1.5),"field_LSR":(0,0,0)}
out={}
for rv in [g["radial_velocity"]-2*g["radial_velocity_error"],g["radial_velocity"],g["radial_velocity"]+2*g["radial_velocity_error"]]:
    c=SkyCoord(ra=g["ra"]*u.deg,dec=g["dec"]*u.deg,distance=(1000/g["parallax"])*u.pc,pm_ra_cosdec=g["pmra"]*u.mas/u.yr,pm_dec=g["pmdec"]*u.mas/u.yr,radial_velocity=rv*u.km/u.s).galactic
    v=c.velocity; U,V,W=v.d_x.to(u.km/u.s).value,v.d_y.to(u.km/u.s).value,v.d_z.to(u.km/u.s).value
    xyz=(c.cartesian.x.value,c.cartesian.y.value,c.cartesian.z.value)
    d={k:round(float(np.sqrt((U-a)**2+(V-b)**2+(W-cc)**2)),1) for k,(a,b,cc) in groups.items()}
    out[f"rv={rv:.1f}"]=dict(UVW=(round(U,1),round(V,1),round(W,1)),XYZ_pc=tuple(round(x,1) for x in xyz),dist_to_group_kms=d); print(out[f"rv={rv:.1f}"])
json.dump(out,open("data/step1_kinematics.json","w"),indent=1)
