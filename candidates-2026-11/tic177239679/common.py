import numpy as np, json
TC1=3073.205; TC2=3906.223; DUR=8/24
RA,DEC=105.20127450,-71.20768920
# Gaia DR3 SB1 orbit of the 2.3" companion (Gaia DR3 5267268250236345600)
NSS=json.load(open("data/gaia_nss_companion.json"))
PB=NSS["period"]; TP=389.0+NSS["t_periastron"]; ECC=NSS["eccentricity"]; OM=np.radians(NSS["arg_periastron"]); KRV=NSS["semi_amplitude_primary"]
def kepler(M,e):
    E=M.copy()
    for _ in range(50): E=E-(E-e*np.sin(E)-M)/(1-e*np.cos(E))
    return E
def true_anom(t):
    M=2*np.pi*(np.asarray(t,float)-TP)/PB; E=kepler(np.mod(M,2*np.pi),ECC)
    return 2*np.arctan2(np.sqrt(1+ECC)*np.sin(E/2),np.sqrt(1-ECC)*np.cos(E/2))
def rv(t): nu=true_anom(t); return KRV*(np.cos(nu+OM)+ECC*np.cos(OM))
def conj_times(t0,t1):
    """times where nu+omega = 90 deg (SB1 primary farthest: companion in front -> 'primary eclipse') and 270 deg."""
    tt=np.arange(t0,t1,0.0005); u=np.mod(true_anom(tt)+OM,2*np.pi)
    out={}
    for lab,ang in [("prim_behind",np.pi/2),("prim_front",3*np.pi/2)]:
        d=np.mod(u-ang+np.pi,2*np.pi)-np.pi; i=np.where((d[:-1]<0)&(d[1:]>=0))[0]; out[lab]=tt[i]
    return out
def phase_b(t,ref=None):
    """orbital phase of the companion SB1, 0 at 'prim_behind' conjunction nearest TC1"""
    if ref is None: ref=conj_times(TC1-3,TC1+3)["prim_behind"]; ref=ref[np.argmin(np.abs(ref-TC1))]
    return np.mod((np.asarray(t)-ref)/PB+0.5,1)-0.5

def harm_design(t, periods=((PB,3),(4.42,2)), seg_order=2, tref=None):
    """columns: per-segment polynomial (segments split at gaps > 0.5 d) + sin/cos harmonics."""
    t=np.asarray(t,float); tref=np.nanmean(t) if tref is None else tref
    cols=[]
    br=np.where(np.diff(t)>0.5)[0]+1
    for idx in np.split(np.arange(len(t)),br):
        ts=t[idx]; c0=ts.mean(); sp=max(ts.max()-ts.min(),1e-3)
        for k in range(seg_order+1):
            c=np.zeros_like(t); c[idx]=((ts-c0)/sp)**k; cols.append(c)
    for P,nh in periods:
        for h in range(1,nh+1):
            cols.append(np.sin(2*np.pi*h*(t-tref)/P)); cols.append(np.cos(2*np.pi*h*(t-tref)/P))
    return np.vstack(cols).T

def harm_fit(t,y,mask_fit,periods=((PB,3),(4.42,2)),seg_order=2):
    """fit on mask_fit points, return model at all t"""
    A=harm_design(t,periods,seg_order); c,*_=np.linalg.lstsq(A[mask_fit],y[mask_fit],rcond=None); return A@c
