"""Independent Python reference over captured real outage data. No application math imports."""
import json,math,statistics,sys,time
from pathlib import Path
from datetime import datetime,timedelta
from zoneinfo import ZoneInfo

root=Path(sys.argv[1] if len(sys.argv)>1 else 'outputs/indicator-outage')
results=[]
def moving(values,n):
    return {i:statistics.fmean(values[i-n+1:i+1]) for i in range(n-1,len(values))}
def exponential(values,n):
    if len(values)<n:return {}
    result={n-1:statistics.fmean(values[:n])}
    for i in range(n,len(values)):result[i]=(2*values[i]+(n-1)*result[i-1])/(n+1)
    return result

for path in sorted((root/'datasets').glob('*.json')):
    obj=json.loads(path.read_text(encoding='utf-8'));data=obj['data'];all_=data['context']+data['candles'];values=[c['close'] for c in all_];visible={c['time'] for c in data['candles']}
    assert data['candles'] and len(data['context'])<=199, obj['id']
    assert len({(c['dataSource'],c['timeframe']) for c in all_})==1, obj['id']
    assert all(c['time']<=time.time() and (i==0 or c['time']>all_[i-1]['time']) for i,c in enumerate(all_)), obj['id']
    for c in all_:
        assert all(math.isfinite(c[k]) for k in ['open','high','low','close']), obj['id']
        assert c['high']>=max(c['open'],c['close'],c['low']) and c['low']<=min(c['open'],c['close']), obj['id']
        assert c['volume'] is None or math.isfinite(c['volume']) and c['volume']>=0, obj['id']
    expected_source={'XAUUSD':'OANDA:XAUUSD','XAGUSD':'OANDA:XAGUSD','GC=F':'COMEX:GC1!','SI=F':'COMEX:SI1!'}.get(obj['symbol'],'Cboe One')
    assert expected_source in data['candles'][0]['dataSource'], obj['id']
    maps={f'SMA{n}':moving(values,n) for n in [20,50,200]}
    maps['EMA20']=exponential(values,20)
    gains=[max(b-a,0) for a,b in zip(values,values[1:])];losses=[max(a-b,0) for a,b in zip(values,values[1:])];rs={}
    if len(values)>14:
        avg_gain=statistics.fmean(gains[:14]);avg_loss=statistics.fmean(losses[:14])
        for i in range(14,len(values)):
            if i>14:avg_gain=(13*avg_gain+gains[i-1])/14;avg_loss=(13*avg_loss+losses[i-1])/14
            rs[i]=50 if avg_loss==avg_gain==0 else 100 if avg_loss==0 else 100-100/(1+avg_gain/avg_loss)
    maps['RSI']=rs
    mid=moving(values,20);maps['BOLL_M']=mid
    maps['BOLL_U']={i:v+2*statistics.pstdev(values[i-19:i+1]) for i,v in mid.items()}
    maps['BOLL_L']={i:v-2*statistics.pstdev(values[i-19:i+1]) for i,v in mid.items()}
    fast=exponential(values,12);slow=exponential(values,26);line={i:fast[i]-v for i,v in slow.items()}
    sig0=exponential(list(line.values()),9);signal={list(line)[i]:v for i,v in sig0.items()}
    maps['MACD']=line;maps['SIGNAL']=signal;maps['HIST']={i:line[i]-v for i,v in signal.items()}
    vw={};session=None;weighted=volume=0;bad=False
    if obj['eligible']:
        for i,c in enumerate(all_):
            local=datetime.fromtimestamp(c['time'],ZoneInfo('America/New_York'));anchor=data['candles'][0].get('vwapSessionStart',0)
            day=local.date()+timedelta(days=int(anchor>0 and local.hour>=anchor))
            if day!=session:session=day;weighted=volume=0;bad=False
            if c['volume'] is None or c['volume']<0:bad=True
            if bad:continue
            weighted+=statistics.fmean([c['high'],c['low'],c['close']])*c['volume'];volume+=c['volume']
            if volume>0:vw[i]=weighted/volume
    maps['VWAP']=vw
    expected={k:[{'time':all_[i]['time'],'value':v} for i,v in m.items() if all_[i]['time'] in visible] for k,m in maps.items()}
    failures=[];points=0
    for key,exp in expected.items():
        actual=obj['series'][key]
        if len(actual)!=len(exp):failures.append(f'{key} length {len(actual)} != {len(exp)}');continue
        for a,e in zip(actual,exp):
            points+=1
            if a['time']!=e['time'] or not math.isclose(a['value'],e['value'],rel_tol=1e-9,abs_tol=1e-8):failures.append(f'{key} {a} != {e}');break
    obj['expected']=expected
    path.write_text(json.dumps(obj,indent=2),encoding='utf-8')
    results.append({'id':obj['id'],'status':'failed' if failures else 'passed','pointsCompared':points,'failures':failures})
(root/'oracle.json').write_text(json.dumps(results,indent=2),encoding='utf-8')
print(json.dumps({'datasets':len(results),'pointsCompared':sum(r['pointsCompared'] for r in results),'failed':[r for r in results if r['status']=='failed']},indent=2))
sys.exit(any(r['status']=='failed' for r in results))
