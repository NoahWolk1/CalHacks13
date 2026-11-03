"""S87 at 3680.19: QLP SAP vs its background (regression), and the same-epoch depth on other stars in the TESScut
cutout (own bkg-subtracted photometry), plus the same for S7 at 1492.739."""
import warnings; warnings.filterwarnings("ignore")
import glob, json, numpy as np, lightkurve as lk
from astropy.coordinates import SkyCoord; import astropy.units as u
from astropy.table import Table
from lcio import load_all
from measure import measure, trapezoid, segments
from common import RA, DEC, TC, DUR, TC2
out={}
r=[x for x in load_all() if x['author']=='QLP' and x['sector']==87][0]
t=r['t']; f=r['flux']['SAP_FLUX']; b=r['aux']['SAP_BKG']; g=(r['q']==0)&np.isfinite(f)&(np.abs(t-TC2)<1.5)
fn=f[g]/np.median(f[g]); bn=b[g]
out['r_flux_bkg_1.5d']=float(np.corrcoef(fn,bn)[0,1])
out['bkg_range_e_s']=[float(bn.min()),float(bn.max())]; out['bkg_in_event']=float(np.median(b[g][np.abs(t[g]-TC2)<DUR/2]))
out['first_q0_time']=float(t[g].min())
# LSQ: flux = poly2 + c*bkg + c2*bkg^2 - depth*box
s=trapezoid(t[g],TC2,DUR); x=t[g]-TC2
for name,cols in [('box+poly2',[-s,np.ones_like(x),x,x**2]),('box+poly2+bkg',[-s,np.ones_like(x),x,x**2,bn,bn**2]),('poly2+bkg (no box)',[np.ones_like(x),x,x**2,bn,bn**2])]:
    A=np.vstack(cols).T; c,*_=np.linalg.lstsq(A,fn,rcond=None); res=fn-A@c; n=len(fn); k=A.shape[1]
    bic=n*np.log(np.mean(res**2))+k*np.log(n)
    cov=np.linalg.pinv(A.T@A)*np.mean(res**2)
    out[name]=dict(depth_ppt=round(float(c[0])*1e3,2) if 'box' in name else None, sig_white_ppt=round(float(np.sqrt(cov[0,0]))*1e3,2) if 'box' in name else None, bic=round(float(bic),1), rms_ppt=round(float(np.std(res))*1e3,2))
print(json.dumps(out,indent=1))
# neighbours in cutout
gaia=Table.read("data/gaia_2arcmin.csv")
from astroquery.gaia import Gaia
q=f"SELECT source_id,ra,dec,phot_g_mean_mag FROM gaiadr3.gaia_source WHERE CONTAINS(POINT(ra,dec),CIRCLE({RA},{DEC},0.06))=1 AND phot_g_mean_mag<14.8"
nb=Gaia.launch_job_async(q).get_results(); print(nb)
for s,tc in [(7,TC),(87,TC2)]:
    tp=lk.read(glob.glob(f"data/tesscut/**/*s00{s:02d}*.fits",recursive=True)[0]); tt=tp.time.value; F=tp.flux.value.astype(float)
    gg=(tp.quality==0)&np.all(np.isfinite(F),axis=(1,2)); tt=tt[gg]; F=F[gg]
    Y,X=np.mgrid[:F.shape[1],:F.shape[2]]
    rows=[]
    for row in nb:
        xs,ys=[float(v) for v in tp.wcs.world_to_pixel(SkyCoord(row['ra']*u.deg,row['dec']*u.deg))]
        if not (2<xs<F.shape[2]-3 and 2<ys<F.shape[1]-3): continue
        rr=np.hypot(X-xs,Y-ys); ann=(rr>4)&(rr<7)
        bk=np.array([np.median(np.sort(fr[ann])[:int(ann.sum()*0.7)]) for fr in F])
        ap=rr<=1.5; y=F[:,ap].sum(1)-bk*ap.sum()
        m=measure(tt,y,tc,DUR,win=1.0)
        rows.append(dict(source_id=int(row['source_id']),G=round(float(row['phot_g_mean_mag']),2),px=[round(xs,1),round(ys,1)],depth_ppt=round(m['depth']*1e3,2),sig=round(m['sig_adopt']*1e3,2),frac_deeper=round(float(m['frac_deeper']),3)))
        print(s,rows[-1])
    out[f'cutout_stars_S{s}']=rows
json.dump(out,open('data/step3_s87_bkg_and_cutout_stars.json','w'),indent=1)
