"""Are the other QLP dips periodic (another EB in the aperture, e.g. the star the event localises on)? BLS on the EB-masked,
detrended QLP S27-93 residuals, 0.3-60 d, 2-6 h durations; and the phase of the event and of the top dips on every OGLE EB within 60"."""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, json
from scipy.ndimage import median_filter
from astropy.timeseries import BoxLeastSquares
from lcio import load_all
from common import TC, DUR
eb=json.load(open("data/step5_eb.json")); P,T0,psec=eb['P'],eb['T0_btjd'],eb['secondary_phase']
T=[];D=[]
for r in load_all(["QLP"]):
    if r['sector']>=96: continue
    t=r['t']; f=r['SAP_FLUX']; g=(r['q']==0)&np.isfinite(f); t=t[g]; f=f[g]/np.nanmedian(f[g])
    ph=((t-T0)/P)%1; m=~((np.minimum(ph,1-ph)*P<0.3)|(np.abs(ph-psec)*P<0.3)); t=t[m]; f=f[m]
    dt=np.median(np.diff(t)); n=int(round(1.5/dt))|1; d=f/median_filter(f,size=n,mode='nearest')-1
    # bin to 30 min
    tb=np.arange(t.min(),t.max(),1/48); i=np.digitize(t,tb); c=np.bincount(i,minlength=len(tb)+1); s=np.bincount(i,weights=d,minlength=len(tb)+1)
    k=c>2; T.append((tb[np.arange(len(c))[k]-1]+1/96)); D.append(s[k]/c[k])
T=np.concatenate(T); D=np.concatenate(D); k=np.abs(D)<6*1.4826*np.median(np.abs(D)); T=T[k]; D=D[k]
bls=BoxLeastSquares(T,D)
per=np.exp(np.linspace(np.log(0.3),np.log(60),200000))
res=bls.power(per,[2/24,4/24,6/24],objective='snr')
o=np.argsort(-res.power); top=[]
for i in o:
    if any(abs(per[i]/p-1)<0.002 for p,_ ,_,_ in top): continue
    ph_ev=((TC-res.transit_time[i])/per[i]+0.5)%1-0.5
    top.append((float(per[i]),float(res.power[i]),float(res.depth[i]*1e3),float(ph_ev*per[i]*24)))
    if len(top)>=10: break
out=dict(bls_top=[dict(P=a,snr=b,depth_ppt=c,event_offset_h=d) for a,b,c,d in top])
# OGLE EBs within 60"
og=json.load(open("data/step7_ogle.json")); sr=json.load(open("data/step5_search.json"))
dips=[x for x in sr['top_dips'] if x['pipe']=='QLP']
out['ogle_phases']=[]
for e in og:
    if e['sep']>60 or not e.get('P'): continue
    T0o=e['T0']-2457000
    f=lambda t:((t-T0o)/e['P']+0.5)%1-0.5
    out['ogle_phases'].append(dict(id=e['id'],sep=e['sep'],P=e['P'],I=e['I'],d1=e['d1'],event_phase=round(f(TC),3),dip_phases=[round(f(x['t']),3) for x in dips]))
print(json.dumps(out,indent=1)); json.dump(out,open("data/step5_bls.json","w"),indent=1)
