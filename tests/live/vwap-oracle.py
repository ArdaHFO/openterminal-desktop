"""Independent session-weighted reference for an exact live UI response."""
import json,sys,math
from datetime import datetime,timedelta
from zoneinfo import ZoneInfo
from pathlib import Path
data=json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
first=data['candles'][0];anchor=first.get('vwapSessionStart',0);visible={c['time'] for c in data['candles']}
session=None;total=weighted=0;invalid=False;result=[];resets=[]
for c in data['context']+data['candles']:
    local=datetime.fromtimestamp(c['time'],ZoneInfo('America/New_York'))
    key=local.date()+timedelta(days=int(anchor>0 and local.hour>=anchor))
    if key!=session:session=key;total=weighted=0;invalid=False;resets.append(c['time'])
    vol=c['volume']
    if vol is None or not math.isfinite(vol) or vol<0:invalid=True
    if invalid:continue
    total+=vol;weighted+=sum(c[k] for k in ['high','low','close'])/3*vol
    if total>0 and c['time'] in visible:result.append({'time':c['time'],'value':weighted/total})
last=next((p['value'] for p in reversed(result) if p['time']==data['candles'][-1]['time']),None)
print(json.dumps({'last':last,'points':len(result),'sessionStart':anchor,'volumeType':first.get('volumeType'),'resets':resets}))
