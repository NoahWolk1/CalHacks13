"""S3 around the event: quality flags, momentum dumps, distance to the sector end, SAP_BKG behaviour, the dip in
faint 'background' pixels of the TPF, and the SAP depth after regressing out SAP_BKG."""
import warnings; warnings.filterwarnings("ignore")
import glob, numpy as np, json, lightkurve as lk
from lcio import load_all
from measure import measure, trapezoid
from common import TC, DUR
r=[x for x in load_all() if x['author']=='SPOC' and x['sector']==3][0]
t=r['t']; q=r['q']; out={}
dumps=np.unique(np.round(t[(q&32)>0],2)); out['dumps_s3']=[float(x) for x in dumps]
out['nearest_dump_d']=float(np.min(np.abs(dumps-TC)))
g=(q==0)&np.isfinite(r['SAP_FLUX'])
out['last_good_cadence']=float(t[g].max()); out['event_to_last_good_d']=round(float(t[g].max()-TC),3)
ev=np.abs(t-TC)<DUR/2; out['frac_q0_in_event']=float((q[ev]==0).mean())
out['flags_in_event']={int(1<<b):int(((q[ev]>>b)&1).sum()) for b in range(16) if ((q[ev]>>b)&1).sum()}
out['flags_after_event_to_end']={int(1<<b):int(((q[t>TC]>>b)&1).sum()) for b in range(16) if ((q[t>TC]>>b)&1).sum()}
bk=r['SAP_BKG']; s=r['SAP_FLUX']
w=g&(np.abs(t-TC)<1)
out['sap_median']=float(np.nanmedian(s[g])); out['bkg_median']=float(np.nanmedian(bk[g]))
mb=measure(t[g],bk[g]+np.nanmedian(s[g]),TC,DUR,win=1.0)   # background expressed as a 'dip' in units of the SAP level
out['bkg_change_in_event_as_ppt_of_sap']=round(-mb['depth']*1e3,2)
# regress SAP on background (linear) within +-1 d, plus quadratic, plus box
tt=t[w]-TC; A=np.vstack([-trapezoid(t[w],TC,DUR),np.ones_like(tt),tt,tt**2,bk[w]-np.mean(bk[w])]).T
c,*_=np.linalg.lstsq(A,s[w]/np.median(s[w]),rcond=None); out['sap_depth_with_bkg_regressor_ppt']=round(c[0]*1e3,2); out['bkg_coeff']=float(c[4]*np.median(s[w]))
A2=A[:,:4]; c2,*_=np.linalg.lstsq(A2,s[w]/np.median(s[w]),rcond=None); out['sap_depth_no_regressor_ppt']=round(c2[0]*1e3,2)
out['r_sap_bkg_pm1d']=float(np.corrcoef(s[w],bk[w])[0,1])
# TPF: depth in the faintest pixels (no star brighter than the field)
f=glob.glob("data/tpf/**/*s0003*tp.fits",recursive=True)[0]
tpf=lk.read(f); T=tpf.time.value; F=tpf.flux.value.astype(float); Q=tpf.quality
gg=(Q==0)&np.all(np.isfinite(F),axis=(1,2)); T=T[gg]; F=F[gg]; med=np.median(F,0)
faint=med<np.percentile(med,30)
m=measure(T,F[:,faint].mean(1)+0,TC,DUR,win=1.0)
out['faint_pixels_n']=int(faint.sum()); out['faint_pixel_median_e_s']=float(np.median(med[faint]))
out['faint_pixel_deficit_e_s_per_px']=round(float(m['depth']*np.median(F[:,faint].mean(1))),2); out['faint_pixel_deficit_sig']=round(float(m['sig_adopt']*np.median(F[:,faint].mean(1))),2)
out['faint_pixel_deficit_x_aperture_npix_e_s']=round(out['faint_pixel_deficit_e_s_per_px']*int(tpf.pipeline_mask.sum()),1)
# compare: aperture deficit (e-/s)
out['aperture_deficit_e_s']=round(1.71e-3*out['sap_median'],1)
c1=r['MOM_CENTR1']; c2_=r['MOM_CENTR2']; ww=g&(np.abs(t-TC)<1.5)&~(np.abs(t-TC)<0.5)
out['centroid_shift_in_minus_out_px']=[float(np.nanmean(c[g&ev])-np.nanmean(c[ww])) for c in (c1,c2_)]
print(json.dumps(out,indent=1)); json.dump(out,open("data/step3_flags.json","w"),indent=1)
