"""Box search (8h, also 4h/12h) over every SPOC 2-min sector with TOI-220 b transits masked: any other ~0.7 ppt events?"""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, json
from lcio import load_all
from measure import fit_depth
from common import P_B, T0_B
hits=[]; cover=[]
for r in load_all():
    if r['author']!='SPOC': continue
    t=r['t']; f=r['PDCSAP_FLUX']; q=r['q']
    ph=((t-T0_B+P_B/2)%P_B)-P_B/2
    g=(q==0)&np.isfinite(f)&np.isfinite(t)&(np.abs(ph)>0.1)
    tt=t[g]; ff=f[g]/np.nanmedian(f[g])
    for dur in [0.333]:
        grid=np.arange(tt.min()+0.3,tt.max()-0.3,0.04)
        dd=[]
        for tc in grid:
            res=fit_depth(tt,ff,tc,dur,1.0,2,min_cov=0.6)
            if res is None or not np.isfinite(res['depth']): continue
            dd.append((tc,res['depth'],res['sig_white']*res['beta']))
        dd=np.array(dd)
        if len(dd)==0: continue
        cover.append((r['sector'],dd[:,0].tolist()))
        rob=1.4826*np.median(np.abs(dd[:,1]-np.median(dd[:,1])))
        snr=dd[:,1]/rob
        # local maxima above 4
        for i in np.where(snr>4)[0]:
            if snr[i]==snr[max(0,i-8):i+9].max():
                hits.append(dict(sector=r['sector'],tc=round(dd[i,0],3),depth_ppt=round(dd[i,1]*1e3,2),snr_vs_scatter=round(snr[i],1),scatter_ppt=round(rob*1e3,3)))
for h in sorted(hits,key=lambda x:-x['snr_vs_scatter']): print(h)
json.dump(dict(hits=hits,cover=cover),open("data/step5_search.json","w"))
