"""S31 around the event: quality flags, momentum dumps, background (scattered light), centroid jitter, and
whether flux correlates with background or centroid."""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, json
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
from lcio import load_all
from common import TC, DUR
r=[x for x in load_all() if x["author"]=="TESS-SPOC" and x["sector"]==67][0]
t=r['t']; q=r['q']; out={}
w=np.abs(t-TC)<1.5
out['sector_start']=float(np.nanmin(t)); out['event_minus_start_d']=float(TC-np.nanmin(t))
dumps=t[(q&32)>0]; out['dumps_within_1.5d']=[round(float(x),3) for x in np.unique(np.round(dumps[np.abs(dumps-TC)<1.5],3))]
out['all_dumps_s67']=[round(float(x),2) for x in np.unique(np.round(dumps,2))]
ev=np.abs(t-TC)<DUR/2
flags={}
for b in range(16):
    n=int(((q[ev]>>b)&1).sum())
    if n: flags[1<<b]=n
out['flags_in_event']=flags; out['frac_q0_in_event']=float((q[ev]==0).mean())
g=(q==0)&np.isfinite(r['SAP_FLUX'])
def b1h(x,y):
    tb=np.arange(TC-1.5,TC+1.5,1/24); i=np.digitize(x,tb); u=[k for k in range(1,len(tb)) if (i==k).sum()>10]
    return np.array([tb[k-1]+1/48 for k in u]), np.array([np.nanmean(y[i==k]) for k in u]), np.array([np.nanstd(y[i==k]) for k in u])
tt,fl,_=b1h(t[g&w],r['SAP_FLUX'][g&w]); fl=fl/np.median(fl)-1
_,bk,_=b1h(t[g&w],r['SAP_BKG'][g&w])
_,c1,j1=b1h(t[g&w],r['MOM_CENTR1'][g&w]); _,c2,j2=b1h(t[g&w],r['MOM_CENTR2'][g&w])
ap_flux=np.nanmedian(r['SAP_FLUX'][g]); 
out['bkg_e_per_s_median']=float(np.nanmedian(r['SAP_BKG'][g])); out['sap_flux_median']=float(ap_flux)
out['bkg_in_event_minus_out']=float(np.nanmean(r['SAP_BKG'][g&ev])-np.nanmean(r['SAP_BKG'][g&w&~(np.abs(t-TC)<0.5)]))
out['r_flux_bkg']=float(np.corrcoef(fl,bk)[0,1]); out['r_flux_centr1']=float(np.corrcoef(fl,c1)[0,1]); out['r_flux_centr2']=float(np.corrcoef(fl,c2)[0,1])
inn=np.abs(tt-TC)<DUR/2
out['jitter_ratio_in_out']=float(np.mean(np.hypot(j1,j2)[inn])/np.mean(np.hypot(j1,j2)[~inn]))
out['centroid_shift_in_minus_out_px']=[float(np.mean(c1[inn])-np.mean(c1[~inn])),float(np.mean(c2[inn])-np.mean(c2[~inn]))]
# centroid vs flux over the whole sector (does centroid follow the variability?)
gg=g&np.isfinite(r['MOM_CENTR1'])
X=r['SAP_FLUX'][gg]/np.nanmedian(r['SAP_FLUX'][gg])-1
for k,c in [('c1',r['MOM_CENTR1'][gg]),('c2',r['MOM_CENTR2'][gg])]:
    out[f'sector_slope_{k}_px_per_ppt']=float(np.polyfit(X*1e3,c-np.mean(c),1)[0])
print(json.dumps(out,indent=1))
json.dump(out,open('data/step3_flags.json','w'),indent=1)
fig,ax=plt.subplots(4,1,figsize=(10,9),sharex=True)
ax[0].plot(tt,fl*1e3,'k.-'); ax[0].set_ylabel('SAP ppt'); ax[1].plot(tt,bk,'b.-'); ax[1].set_ylabel('SAP_BKG e/s')
ax[2].plot(tt,c1-np.mean(c1),'r.-',label='col'); ax[2].plot(tt,c2-np.mean(c2),'g.-',label='row'); ax[2].legend(); ax[2].set_ylabel('centroid px')
ax[3].plot(tt,np.hypot(j1,j2)*1e3,'m.-'); ax[3].set_ylabel('jitter mpx')
for a in ax:
    a.axvspan(TC-DUR/2,TC+DUR/2,color='orange',alpha=.2)
    for d in out['dumps_within_1.5d']: a.axvline(d,color='c',ls='--')
ax[0].set_title('S67 TESS-SPOC 200-s, 1 h bins (cyan: momentum dumps)'); fig.tight_layout(); fig.savefig('figs/step3_flags.png',dpi=90)
