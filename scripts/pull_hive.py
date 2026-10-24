"""Re-pull live Cal Hacks data (prizes, schedule, starter packs) into docs/sources/.

Usage: python scripts/pull_hive.py
"""
import json, os, urllib.request
from datetime import datetime, timedelta, timezone
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
out = os.path.join(ROOT, 'docs', 'sources')
API = 'https://hive.hackberkeley.org/api/live/'

def fetch(name):
    req = urllib.request.Request(API + name, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req) as r:
        return json.load(r)

os.makedirs(out, exist_ok=True)
PDT = timezone(timedelta(hours=-7))
p = fetch('prizes')
s = fetch('schedule')
r = fetch('resources')

from datetime import date
captured = date.today().isoformat()

def hdr(title, src, updated, summary):
    return (f"# {title}\n\n> **Source:** {src}  \n> **Captured:** {captured} (live data updated {updated})  \n"
            f"> **Summary:** {summary}  \n> Raw snapshot, generated from the live site's API. Do not hand-edit; re-pull instead.\n\n")

with open(f'{out}/hive-prizes.md', 'w', encoding='utf-8') as f:
    f.write(hdr('Live prize tracks (hive.hackberkeley.org)', 'https://hive.hackberkeley.org/prizes (`/api/live/prizes`)',
                p.get('updatedAt', '?'), 'Every prize track on the live site, verbatim. Newer than the Hacker Guide PDF.'))
    for x in p['prizes']:
        f.write(f"## {x['title']}\n\n**Sponsor:** {x['sponsor'].strip()}  \n**Prize:** {x['details'].strip()}\n\n")
        if x['description'].strip():
            f.write(x['description'].strip() + "\n\n")

with open(f'{out}/hive-schedule.md', 'w', encoding='utf-8') as f:
    f.write(hdr('Live event schedule (hive.hackberkeley.org)', 'https://hive.hackberkeley.org/schedule (`/api/live/schedule`)',
                s.get('updatedAt', 'n/a'), 'Full schedule, all times converted to Pacific (PDT).'))
    for d in s['days']:
        f.write(f"## {d['label']}: {d['date']}\n\n| Time (PDT) | Event | Location | Type |\n|---|---|---|---|\n")
        evs = sorted([e for e in s['events'] if e['day'] == d['id']], key=lambda e: e['start'])
        for e in evs:
            st = datetime.fromisoformat(e['start']).astimezone(PDT).strftime('%a %I:%M %p')
            en = datetime.fromisoformat(e['end']).astimezone(PDT).strftime('%I:%M %p') if e.get('end') else ''
            f.write(f"| {st}–{en} | {e['title']} | {(e.get('location') or '').strip()} | {e.get('type') or ''} |\n")
        f.write("\n")
    f.write("## Event descriptions\n\n")
    for e in sorted(s['events'], key=lambda e: e['start']):
        if (e.get('description') or '').strip():
            f.write(f"### {e['title']}\n\n{e['description'].strip()}\n\n")

with open(f'{out}/hive-starter-packs.md', 'w', encoding='utf-8') as f:
    f.write(hdr('Sponsor starter packs (hive.hackberkeley.org)', 'https://hive.hackberkeley.org/resources (`/api/live/resources`)',
                r.get('updatedAt', '?'), 'Links to each sponsor\'s starter pack. Most are Google Docs not yet pulled into this repo.'))
    seen = set()
    for g in r['groups']:
        for i in g['items']:
            if i['title'] in seen: continue
            seen.add(i['title'])
            f.write(f"- **{i['title']}**: {i['href']}\n")
