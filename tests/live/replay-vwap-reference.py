"""Independent replay reference. Reads bars, never imports application calculations."""
import json,sys,math,time
from datetime import datetime,timedelta
from zoneinfo import ZoneInfo
from pathlib import Path

def reference(candles):
    anchor=candles[0]['vwapSessionStart'];total=weighted=0;session=None;bad=False;result=[];boundaries=[];midnights=[];previous=None
    for i,c in enumerate(candles):
        local=datetime.fromtimestamp(c['time'],ZoneInfo('America/New_York'));key=local.date()+timedelta(days=int(local.hour>=anchor))
        if key!=session:
            if session is not None:boundaries.append(i)
            session=key;total=weighted=0;bad=False
        elif previous is not None and local.date()!=previous.date():midnights.append(i)
        previous=local;volume=c['volume']
        if volume is None or not math.isfinite(volume) or volume<0:bad=True
        if bad:continue
        weighted+=sum(c[k] for k in ['high','low','close'])/3*volume;total+=volume
        if total>0:result.append({'time':c['time'],'value':weighted/total})
    return {'series':result,'boundaries':boundaries,'midnights':midnights}

def audit(root):
    results=[]
    files=sorted((root/'datasets').glob('*.json'));assert len(files)==24, f'Expected 24 replay datasets, found {len(files)}'
    for path in files:
        d=json.loads(path.read_text(encoding='utf-8'));bars=d['candles'];expected=reference(bars);actual=d['actual'];errors=[]
        assert len({(c['dataSource'],c['timeframe'],c['volumeType'],c['vwapSessionStart']) for c in bars})==1,d['id']
        for i,c in enumerate(bars):
            assert c['time']+d['seconds']<=d['fetchedAt'],d['id']
            assert not i or c['time']-bars[i-1]['time']>=d['seconds'],d['id']
            assert all(math.isfinite(c[k]) for k in ['open','high','low','close']),d['id']
            assert c['high']>=max(c['open'],c['close'],c['low']) and c['low']<=min(c['open'],c['close']),d['id']
        if len(actual)!=len(expected['series']):errors.append('series length')
        for a,b in zip(actual,expected['series']):
            if a['time']!=b['time'] or not math.isclose(a['value'],b['value'],rel_tol=1e-9,abs_tol=1e-8):errors.append('numeric mismatch');break
        assert d['boundaries']==expected['boundaries'] and d['midnights']==expected['midnights'],d['id']
        for p in d['prefixes']:
            prefix=bars[:p['position']];ref=reference(prefix)['series'];value=next((v['value'] for v in reversed(ref) if v['time']==prefix[-1]['time']),None)
            if (value is None)!=(p['last'] is None) or value is not None and not math.isclose(value,p['last'],rel_tol=1e-9,abs_tol=1e-8):errors.append('prefix mismatch')
        d['expected']=expected;path.write_text(json.dumps(d,indent=2),encoding='utf-8')
        results.append({'id':d['id'],'status':'failed' if errors else 'passed','points':len(actual),'prefixes':len(d['prefixes']),'errors':errors})
    (root/'oracle.json').write_text(json.dumps(results,indent=2),encoding='utf-8')
    print(json.dumps({'datasets':len(results),'points':sum(r['points'] for r in results),'prefixes':sum(r['prefixes'] for r in results),'failed':[r for r in results if r['status']=='failed']},indent=2))
    return any(r['status']=='failed' for r in results)

if __name__=='__main__':
    if sys.argv[1]=='--response':
        d=json.loads(Path(sys.argv[2]).read_text(encoding='utf-8'));print(json.dumps(reference(d if isinstance(d,list) else d['candles'])))
    else:sys.exit(audit(Path(sys.argv[1])))
