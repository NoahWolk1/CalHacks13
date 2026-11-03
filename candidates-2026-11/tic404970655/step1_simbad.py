import requests
for name in ["OGLE LMC-ECL-37031"]:
    t=requests.get("https://simbad.cfa.harvard.edu/simbad/sim-id",params={"Ident":name,"output.format":"ASCII"},timeout=60).text
    print(t[:3000]); open("data/step1_simbad.txt","w").write(t)
