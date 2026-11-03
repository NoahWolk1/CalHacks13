"""S31 around the sweep epoch: quality flags, momentum dumps, background and centroid jitter (SPOC 2-min)."""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, json
from lcio import load_all
from common import TC, DUR
r=[x for x in load_all() if x['author']=='SPOC' and x['sector']==31][0]
t=r['t']; q=r['q']; out={}
dumps=np.unique(np.round(t[(q&32)>0],2)); out['dumps_s31']=[float(x) for x in dumps]
ev=np.abs(t-TC)<DUR/2; out['frac_q0_in_event']=float((q[ev]==0).mean())
out['flags_in_event']={int(1<<b):int(((q[ev]>>b)&1).sum()) for b in range(16) if ((q[ev]>>b)&1).sum()}
g=(q==0)&np.isfinite(r['SAP_FLUX']); w=np.abs(t-TC)<1.5
bk=r['SAP_BKG']; out['bkg_median']=float(np.nanmedian(bk[g])); out['sap_median']=float(np.nanmedian(r['SAP_FLUX'][g]))
out['bkg_in_minus_out']=float(np.nanmean(bk[g&ev])-np.nanmean(bk[g&w&~(np.abs(t-TC)<0.7)]))
c1=r['MOM_CENTR1']; c2=r['MOM_CENTR2']
out['centroid_shift_in_minus_out_px']=[float(np.nanmean(c[g&ev])-np.nanmean(c[g&w&~(np.abs(t-TC)<0.7)])) for c in (c1,c2)]
print(json.dumps(out,indent=1)); json.dump(out,open("data/step3_flags.json","w"),indent=1)
