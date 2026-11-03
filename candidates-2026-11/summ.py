import json,sys
for d in json.load(open(sys.argv[1])):
    print(d['event'],d['author'],d['sector'],d['col'],d['qual'],d.get('depth_ppt'),'+-',d.get('sig_adopt'),'b',d.get('beta'),'fd',d.get('frac_deeper'),'cov',d.get('cov'),'bkgreg',d.get('bkgreg_depth'),d.get('bkgreg_sig'))
