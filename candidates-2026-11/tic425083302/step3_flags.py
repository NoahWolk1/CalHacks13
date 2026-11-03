"""S30 systematics around the event: QLP quality flags, SAP_BKG, SAP_X/Y; TESScut quality bits (momentum dumps = bit 32, all non-zero),
background (faint-pixel median) and the event box depth on every other bright star in the 25x25 cutout (same-time dips)."""
import warnings; warnings.filterwarnings("ignore")
import glob, json, numpy as np, lightkurve as lk
from astropy.table import Table
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
from lcio import load_all
from measure import measure
from common import TC, DUR
out={}
r=[x for x in load_all(["QLP"]) if x['sector']==30][0]; t=r['t']; q=r['q']
ev=np.abs(t-TC)<DUR/2; w=np.abs(t-TC)<1.5
out['qlp_flags_in_event']={int(b):int(((q[ev]&b)>0).sum()) for b in np.unique(q[ev]) if b}; out['qlp_frac_q0_event']=float((q[ev]==0).mean())
out['qlp_flagged_within_1.5d']=int((q[w]!=0).sum())
g=(q==0)&w; bk=r['SAP_BKG']
out['qlp_bkg_event_minus_out']=float(np.nanmean(bk[g&ev])-np.nanmean(bk[g&~(np.abs(t-TC)<0.4)])); out['qlp_bkg_rms_window']=float(np.nanstd(bk[g]))
for c in ['SAP_X','SAP_Y']: out[f'qlp_{c}_event_minus_out_px']=float(np.nanmean(r[c][g&ev])-np.nanmean(r[c][g&~(np.abs(t-TC)<0.4)]))
out['qlp_sap_x_rms']=float(np.nanstd(r['SAP_X'][g]))
f=r['SAP_FLUX']; out['r_flux_bkg_1.5d']=float(np.corrcoef(f[g],bk[g])[0,1])
tpf=lk.read(glob.glob("data/tesscut/**/tess-s0030*.fits",recursive=True)[0])
tt=tpf.time.value; F=tpf.flux.value.astype(float); qq=tpf.quality
out['tesscut_quality_bits_within_1d']={int(b):int(((qq[np.abs(tt-TC)<1]&b)>0).sum()) for b in [1,2,4,8,16,32,128,1024,2048,4096]}
out['momentum_dumps_s30']=[round(float(x),3) for x in tt[(qq&32)>0]]
out['nearest_dump_d']=float(np.min(np.abs(tt[(qq&32)>0]-TC))) if ((qq&32)>0).any() else None
ok=np.all(np.isfinite(F),axis=(1,2))&(qq==0); tt=tt[ok]; F=F[ok]
med=np.nanmedian(F,0); bkg=np.nanmedian(F[:,med<np.nanpercentile(med,20)],1)
out['tesscut_bkg_event_minus_out']=float(np.mean(bkg[np.abs(tt-TC)<DUR/2])-np.mean(bkg[(np.abs(tt-TC)>0.4)&(np.abs(tt-TC)<1.5)]))
out['tesscut_bkg_median']=float(np.median(bkg))
out['gap']=dict(before=float(tt[tt<TC].max()) if (tt<TC).any() else None, orbit_gap=[float(tt[np.argmax(np.diff(tt))]),float(tt[np.argmax(np.diff(tt))+1])])
# other stars in the cutout: local maxima brighter than the 90th percentile, >3 px from the target
from scipy.ndimage import maximum_filter
pk=(med==maximum_filter(med,size=3))&(med>np.percentile(med,93))
yy,xx=np.where(pk); xt,yt=[float(v) for v in tpf.wcs.world_to_pixel_values(83.0613577,-67.6753544)]
rows=[]
for y,x in zip(yy,xx):
    if np.hypot(x-xt,y-yt)<3 or x<2 or y<2 or x>22 or y>22: continue
    lc=F[:,y-1:y+2,x-1:x+2].sum((1,2))-9*bkg
    m=measure(tt,lc,TC,DUR,win=1.0)
    if m is None or not np.isfinite(m.get('depth',np.nan)): continue
    rows.append(dict(px=[int(x),int(y)],flux=round(float(med[y-1:y+2,x-1:x+2].sum()),0),depth_ppt=round(m['depth']*1e3,2),sig=round(m['sig_adopt']*1e3,2),snr=round(m['depth']/m['sig_adopt'],1)))
out['other_stars']=rows; s=np.array([x['snr'] for x in rows])
out['other_stars_summary']=dict(n=len(rows),median_snr=float(np.median(s)),n_snr_gt3=int((s>3).sum()),n_snr_lt_minus3=int((s<-3).sum()))
print(json.dumps({k:v for k,v in out.items() if k!='other_stars'},indent=1)); print(sorted(rows,key=lambda x:-x['snr'])[:6])
json.dump(out,open("data/step3_flags.json","w"),indent=1)
fig,ax=plt.subplots(4,1,figsize=(10,9),sharex=True); m=w
ax[0].plot(t[m],f[m],'k.',ms=2); ax[0].set_ylabel('QLP SAP'); ax[1].plot(t[m],bk[m],'b.',ms=2); ax[1].set_ylabel('QLP SAP_BKG')
ax[2].plot(t[m],r['SAP_X'][m]-np.nanmedian(r['SAP_X'][m]),'r.',ms=2,label='x'); ax[2].plot(t[m],r['SAP_Y'][m]-np.nanmedian(r['SAP_Y'][m]),'g.',ms=2,label='y'); ax[2].legend(); ax[2].set_ylabel('QLP centroid px')
mm=np.abs(tt-TC)<1.5; ax[3].plot(tt[mm],bkg[mm],'m.',ms=2); ax[3].set_ylabel('TESScut faint-pixel bkg')
for a in ax: a.axvspan(TC-DUR/2,TC+DUR/2,color='orange',alpha=.2)
fig.tight_layout(); fig.savefig('figs/step3_flags.png',dpi=90)
