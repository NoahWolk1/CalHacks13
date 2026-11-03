"""S7 QLP SAP and own TESScut (r=1.5, bkg-sub, step pixel included): is the event a box dip or a step at 1492.85?
Models on +-1 d: quadratic + box(6 h at 1492.739); quadratic + step(t > ts, ts free on a grid); quadratic + step + box."""
import warnings; warnings.filterwarnings("ignore")
import glob, json, numpy as np, lightkurve as lk
from astropy.coordinates import SkyCoord; import astropy.units as u
from lcio import load_all
from measure import trapezoid
from common import RA, DEC, TC, DUR
def bic(A,y):
    c,*_=np.linalg.lstsq(A,y,rcond=None); r=y-A@c; return len(y)*np.log(np.mean(r**2))+A.shape[1]*np.log(len(y)), c
def test(t,y):
    w=np.abs(t-TC)<1.0; t=t[w]; y=y[w]/np.median(y[w]); x=t-TC; s=trapezoid(t,TC,DUR)
    base=[np.ones_like(x),x,x**2]
    b_box,c_box=bic(np.vstack(base+[-s]).T,y)
    best=None
    for ts in np.arange(TC-0.5,TC+0.5,0.005):
        st=(t>ts).astype(float); b,c=bic(np.vstack(base+[st]).T,y)
        if best is None or b<best[0]: best=(b,ts,c[-1])
    st=(t>best[1]).astype(float); b_both,c_both=bic(np.vstack(base+[st,-s]).T,y)
    return dict(bic_box=round(b_box,1),depth_box_ppt=round(c_box[-1]*1e3,2),bic_step=round(best[0],1),t_step=round(best[1],3),step_ppt=round(best[2]*1e3,2),
                bic_step_plus_box=round(b_both,1),depth_with_step_ppt=round(c_both[-1]*1e3,2),dBIC_box_minus_step=round(b_box-best[0],1),dBIC_stepbox_minus_step=round(b_both-best[0],1))
out={}
r=[x for x in load_all() if x['author']=='QLP' and x['sector']==7][0]; g=(r['q']==0)&np.isfinite(r['flux']['SAP_FLUX'])
out['QLP_SAP']=test(r['t'][g],r['flux']['SAP_FLUX'][g])
r=[x for x in load_all() if x['author']=='TGLC' and x['sector']==7][0]; g=(r['q']==0)&np.isfinite(r['flux']['aperture_flux'])
out['TGLC_aperture']=test(r['t'][g],r['flux']['aperture_flux'][g])
tpf=lk.read(glob.glob("data/tesscut/**/*s0007*.fits",recursive=True)[0]); t=tpf.time.value; F=tpf.flux.value.astype(float)
xt,yt=[float(v) for v in tpf.wcs.world_to_pixel(SkyCoord(RA*u.deg,DEC*u.deg))]; Y,X=np.mgrid[:21,:21]; rr=np.hypot(X-xt,Y-yt); ann=(rr>5)&(rr<8)
bk=np.array([np.median(np.sort(fr[ann])[:int(ann.sum()*0.7)]) for fr in F]); ap=rr<=1.5
out['own_r1.5']=test(t,F[:,ap].sum(1)-bk*ap.sum())
out['pixel_r12c10']=test(t,F[:,12,10]-bk)
for k,v in out.items(): print(k,v)
json.dump(out,open('data/step3_step_vs_box.json','w'),indent=1)
