"""Does detrending a flare (no dip) produce the 'transit'? Apply spline / running-median detrenders to
(a) the real SAP and (b) the noise-free baseline+flare model (no dip); measure the 6 h dip at the event."""
import numpy as np, json
from scipy.interpolate import LSQUnivariateSpline
from scipy.ndimage import median_filter
from lcio import load_all
from measure import trapezoid, fit_depth
M=json.load(open("data/step2_flaremodel.json"))
def flare(t,tp,fwhm,amp):
    x=(t-tp)/fwhm; f=np.zeros_like(t)
    r=(x>-1)&(x<=0); f[r]=1+1.941*x[r]-0.175*x[r]**2-2.246*x[r]**3-1.125*x[r]**4
    d=x>0; f[d]=0.6890*np.exp(-1.600*x[d])+0.3030*np.exp(-0.2783*x[d])
    return amp*f
def spline_detrend(t,y,dk,iters=3):
    w=np.ones(len(t),bool)
    for _ in range(iters):
        kn=np.arange(t[w].min()+dk,t[w].max()-dk/2,dk)
        s=LSQUnivariateSpline(t[w],y[w],kn,k=3); res=y-s(t); sd=1.4826*np.median(np.abs(res[w]))
        w=np.abs(res)<3*sd  # symmetric clip, as a generic detrender would
    return y/s(t)
def runmed(t,y,width):
    dt=np.median(np.diff(t)); n=int(width/dt)|1; return y/median_filter(y,n,mode='nearest')
out={}
for sec,tc in [(65,3084.74),(97,3979.76)]:
    r=load_all(sectors=[sec])[0]; t=r["t"]; f=r["SAP_FLUX"]
    g=np.isfinite(t)&np.isfinite(f)&(r["q"]==0)&(np.abs(t-tc)<1.5); t=t[g]; y=f[g]/np.nanmedian(f[g]); t0=t.mean()
    p=np.array(M[f"S{sec}"]["nodip"]["p"]); npoly=4
    mod=sum(p[i]*(t-t0)**i for i in range(npoly))
    for j in range((len(p)-npoly)//3): mod=mod+flare(t,p[npoly+3*j],abs(p[npoly+3*j+1]),p[npoly+3*j+2])
    for name,fn in [("spline0.5d",lambda tt,yy:spline_detrend(tt,yy,0.5)),("spline0.3d",lambda tt,yy:spline_detrend(tt,yy,0.3)),("spline1d",lambda tt,yy:spline_detrend(tt,yy,1.0)),
                    ("runmed0.63d",lambda tt,yy:runmed(tt,yy,0.63)),("runmed1d",lambda tt,yy:runmed(tt,yy,1.0)),("runmed2d",lambda tt,yy:runmed(tt,yy,2.0))]:
        row={}
        for lab,yy in [("real",y),("model_nodip",mod)]:
            d=fn(t,yy); m=fit_depth(t,d,tc,0.25,win=1.0,order=0)
            row[lab]=m["depth"]*1e3
        # also the vet-style local quadratic on raw
        out[f"S{sec}_{name}"]=row; print(sec,name,{k:round(v,2) for k,v in row.items()})
    for lab,yy in [("real",y),("model_nodip",mod)]:
        m=fit_depth(t,yy,tc,0.25,win=0.75,order=2); print(sec,"localquad0.75",lab,round(m["depth"]*1e3,2))
json.dump(out,open("data/step2_detrend_sim.json","w"),indent=1)
