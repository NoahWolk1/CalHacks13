import warnings; warnings.filterwarnings("ignore")
from astropy.table import Table, join
from astroquery.gaia import Gaia
r=Table.read("data/gaia_2arcmin.csv")
ids=",".join(str(x) for x in r['source_id'][r['phot_g_mean_mag']<18])
x=Gaia.launch_job_async(f"SELECT source_id,best_class_name,best_class_score FROM gaiadr3.vari_classifier_result WHERE source_id IN ({ids})").get_results()
j=join(r['source_id','sep','phot_g_mean_mag','bp_rp','ruwe'],x,keys='source_id'); j.sort('sep'); print("== Gaia DR3 variability classes, G<18 within 2'"); j.pprint(max_lines=60,max_width=200)
x=Gaia.launch_job_async(f"SELECT source_id,frequency,global_ranking,model_type,derived_primary_ecl_depth,derived_secondary_ecl_depth FROM gaiadr3.vari_eclipsing_binary WHERE source_id IN ({ids})").get_results()
if len(x):
    j=join(r['source_id','sep','phot_g_mean_mag'],x,keys='source_id'); j['P_d']=1/j['frequency']; j.sort('sep'); print("== Gaia EBs"); j.pprint(max_width=200)
x=Gaia.launch_job_async(f"SELECT * FROM gaiadr3.vari_short_timescale WHERE source_id IN ({ids})").get_results()
print("== vari_short_timescale",len(x))
for row in x:
    print({c:row[c] for c in x.colnames if str(row[c]) not in ('--','nan')})
