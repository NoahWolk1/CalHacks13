"""Rank the event among all dips and brightenings from step5_search.json, with and without edge cuts."""
import json, sys, numpy as np
from common import EVENTS
d=json.load(open("data/step5_search.json")); H=d["hits"]
tc0=EVENTS[0][1]
out={}
for prod in sorted(set(h["prod"] for h in H)):
    for cut,cond in [("all",lambda h:True),("away_from_edges(d_gap>0.3,d_flag>0.1)",lambda h:h["d_gap"]>0.3 and h["d_flag"]>0.1)]:
        hh=[h for h in H if h["prod"]==prod and cond(h) and abs(h["depth_ppt"])<200]
        ev=[h for h in hh if abs(h["tc"]-tc0)<0.15 and h["kind"]=="dip"]
        evs=ev[0]["snr"] if ev else None
        row=dict(n_dip_ge_3p5=sum(h["kind"]=="dip" for h in hh),n_bright_ge_3p5=sum(h["kind"]=="bright" for h in hh),event_snr=evs)
        if evs:
            row["n_dip_ge_event"]=sum(h["kind"]=="dip" and h["snr"]>=evs for h in hh); row["n_bright_ge_event"]=sum(h["kind"]=="bright" and h["snr"]>=evs for h in hh)
            dd=abs(ev[0]["depth_ppt"]); row["event_depth"]=dd
            row["n_dip_deeper_abs"]=sum(h["kind"]=="dip" and h["depth_ppt"]>=dd for h in hh); row["n_bright_ge_abs"]=sum(h["kind"]=="bright" and -h["depth_ppt"]>=dd for h in hh)
        for th in (4,5,6): row[f"dip_ge{th}"]=sum(h["kind"]=="dip" and h["snr"]>=th for h in hh); row[f"bright_ge{th}"]=sum(h["kind"]=="bright" and h["snr"]>=th for h in hh)
        out[f"{prod} {cut}"]=row; print(prod,cut,row)
        if cut!="all":
            print("  top dips:",[(h["sector"],h["tc"],h["depth_ppt"],h["snr"]) for h in sorted([h for h in hh if h["kind"]=="dip"],key=lambda x:-x["snr"])[:8]])
            print("  top brightenings:",[(h["sector"],h["tc"],h["depth_ppt"],h["snr"]) for h in sorted([h for h in hh if h["kind"]=="bright"],key=lambda x:-x["snr"])[:8]])
json.dump(out,open("data/step5_rank.json","w"),indent=1)
