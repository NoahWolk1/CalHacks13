"""Count dips vs brightenings (|S/N| and |depth| thresholds) from step5_search.json; rank the event."""
import json
R=json.load(open('data/step5_search.json')); out={}
for prod in [('QLP','SAP_FLUX'),('TESS-SPOC','PDCSAP_FLUX'),('TESS-SPOC','SAP_FLUX')]:
    rr=[r for r in R if (r['author'],r['col'])==prod]; k=' '.join(prod); o={}
    for thr in [3,4,4.7,5,6]:
        o[f'snr>={thr}']=dict(dips=sum(r['sign']==1 and r['snr']>=thr for r in rr),bright=sum(r['sign']==-1 and -r['snr']>=thr for r in rr))
    for thr in [3,4,4.8]:
        o[f'depth>={thr}ppt']=dict(dips=sum(r['sign']==1 and r['depth_ppt']>=thr for r in rr),bright=sum(r['sign']==-1 and -r['depth_ppt']>=thr for r in rr))
    o['top_bright']=sorted([dict(sector=r['sector'],tc=r['tc'],depth=r['depth_ppt'],snr=-r['snr']) for r in rr if r['sign']==-1],key=lambda x:-x['snr'])[:5]
    o['top_dips']=sorted([dict(sector=r['sector'],tc=r['tc'],depth=r['depth_ppt'],snr=r['snr']) for r in rr if r['sign']==1],key=lambda x:-x['snr'])[:8]
    out[k]=o; print(k,json.dumps(o,indent=0))
json.dump(out,open('data/step5_count.json','w'),indent=1)
