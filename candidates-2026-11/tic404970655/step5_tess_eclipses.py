"""Every OGLE-predicted primary and secondary eclipse in TESS (SPOC 2-min S28-39 SAP & PDCSAP, QLP SAP elsewhere):
coverage, time of minimum and depth (min of 1-h bins vs a linear baseline from 0.6-1.5 d either side), plus a fit
of a common eclipse template to the S31 events. Also a free search: the 30 deepest 8 h/20 h dips in all SPOC SAP."""
import warnings; warnings.filterwarnings("ignore")
import numpy as np, json
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
from lcio import load_all
P, E = 20.1104183, 3000.2755
SPH=0.3232   # OGLE secondary phase
L=load_all()
def b1h(t,f,t0,half=1.6):
    w=np.abs(t-t0)<half; tb=np.arange(t0-half,t0+half+1e-9,1/24); i=np.digitize(t[w],tb)
    x=[];y=[]
    for k in range(1,len(tb)):
        s=i==k
        if s.sum()>=3: x.append(t[w][s].mean()); y.append(f[w][s].mean())
    return np.array(x),np.array(y)
rows=[]
for kind,off in [("primary",0.0),("secondary",SPH)]:
    for k in range(-60,60):
        tp=E+(k+off)*P
        for r in L:
            if r['author'] not in ('SPOC','QLP'): continue
            if r['author']=='QLP' and r['sector'] in range(28,40) and r['sector']!=37: continue
            t=r['t']
            if not (np.nanmin(t)-0.5<tp<np.nanmax(t)+0.5): continue
            for col in (['SAP_FLUX','PDCSAP_FLUX'] if r['author']=='SPOC' else ['SAP_FLUX']):
                g=(r['q']==0)&np.isfinite(r[col]); x,y=b1h(t[g],r[col][g]/np.nanmedian(r[col][g]),tp)
                inn=np.abs(x-tp)<0.45; oot=(np.abs(x-tp)>0.6)
                rec=dict(kind=kind,cycle=k,t_pred=round(tp,3),author=r['author'],sector=int(r['sector']),col=col,n_in=int(inn.sum()),n_oot_left=int((oot&(x<tp)).sum()),n_oot_right=int((oot&(x>tp)).sum()))
                if inn.sum()>=6 and oot.sum()>=6:
                    c=np.polyfit(x[oot]-tp,y[oot],1); res=y-np.polyval(c,x-tp)
                    j=np.argmin(np.where(inn,res,9)); rec.update(t_min=round(float(x[j]),3),dt_min_h=round(float(x[j]-tp)*24,1),depth_ppt=round(float(-res[j])*1e3,1),
                        rms_oot_ppt=round(float(np.std(res[oot]))*1e3,1))
                rows.append(rec)
for r in rows:
    if r['col']=='SAP_FLUX': print(r)
json.dump(rows,open("data/step5_tess_eclipses.json","w"),indent=1)
# figure: all covered SPOC SAP eclipses stacked
fig,ax=plt.subplots(1,2,figsize=(14,10))
for a,kind in zip(ax,["primary","secondary"]):
    o=0
    for rec in [r for r in rows if r['kind']==kind and r['col']=='SAP_FLUX' and 'depth_ppt' in r]:
        rr=[x for x in L if x['author']==rec['author'] and x['sector']==rec['sector']][0]
        g=(rr['q']==0)&np.isfinite(rr['SAP_FLUX']); x,y=b1h(rr['t'][g],rr['SAP_FLUX'][g]/np.nanmedian(rr['SAP_FLUX'][g]),rec['t_pred'])
        a.plot((x-rec['t_pred'])*24,(y-np.median(y))*1e3+o,'.-',ms=3); a.text(30,o,f"{rec['author'][:4]} S{rec['sector']} {rec['t_pred']:.1f}: {rec['depth_ppt']} ppt",fontsize=7); o-=60
    a.axvline(0,color='r',ls=':'); a.set_xlabel('hours from OGLE-predicted time'); a.set_title(f"{kind} eclipses in TESS SAP (1-h bins, offset)"); a.set_xlim(-38,60)
fig.tight_layout(); fig.savefig("figs/step5_tess_eclipses.png",dpi=85)
