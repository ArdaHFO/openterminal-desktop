"""Independent Python replay indicator reference. No application math imports."""
import json,math,statistics,sys
from pathlib import Path

def moving(values,n):
    return {i:statistics.fmean(values[i-n+1:i+1]) for i in range(n-1,len(values))}
def exponential(values,n):
    if len(values)<n:return {}
    out={n-1:statistics.fmean(values[:n])}
    for i in range(n,len(values)):out[i]=(2*values[i]+(n-1)*out[i-1])/(n+1)
    return out
def reference(bars):
    values=[b['close'] for b in bars];maps={f'SMA{n}':moving(values,n) for n in [20,50,200]};maps['EMA20']=exponential(values,20)
    gains=[max(b-a,0) for a,b in zip(values,values[1:])];losses=[max(a-b,0) for a,b in zip(values,values[1:])];rs={}
    if len(values)>14:
        gain=statistics.fmean(gains[:14]);loss=statistics.fmean(losses[:14])
        for i in range(14,len(values)):
            if i>14:gain=(13*gain+gains[i-1])/14;loss=(13*loss+losses[i-1])/14
            rs[i]=50 if gain==loss==0 else 100 if loss==0 else 100-100/(1+gain/loss)
    maps['RSI']=rs;mid=moving(values,20);maps['BOLL_M']=mid
    maps['BOLL_U']={i:v+2*statistics.pstdev(values[i-19:i+1]) for i,v in mid.items()};maps['BOLL_L']={i:v-2*statistics.pstdev(values[i-19:i+1]) for i,v in mid.items()}
    fast=exponential(values,12);slow=exponential(values,26);line={i:fast[i]-v for i,v in slow.items()};indices=list(line);sig0=exponential(list(line.values()),9);signal={indices[i]:v for i,v in sig0.items()}
    maps['MACD']=line;maps['SIGNAL']=signal;maps['HIST']={i:line[i]-v for i,v in signal.items()}
    return {k:[{'time':bars[i]['time'],'value':v} for i,v in m.items()] for k,m in maps.items()}
def audit(root):
    files=sorted((root/'datasets').glob('*.json'));assert len(files)==24,f'Expected 24 datasets, found {len(files)}';results=[]
    for p in files:
        d=json.loads(p.read_text(encoding='utf-8'));bars=d['bars'];expected=reference(bars);errors=[];points=0
        assert len({(c['dataSource'],c['timeframe']) for c in bars})==1,d['id']
        for i,c in enumerate(bars):
            assert c['time']+d['seconds']<=d['fetchedAt'] and (not i or c['time']-bars[i-1]['time']>=d['seconds']),d['id']
            assert all(math.isfinite(c[k]) for k in ['open','high','low','close']),d['id']
            assert c['high']>=max(c['open'],c['close'],c['low']) and c['low']<=min(c['open'],c['close']),d['id']
        for key,exp in expected.items():
            actual=d['actual'][key]
            if len(actual)!=len(exp):errors.append(key+' length')
            for a,b in zip(actual,exp):
                points+=1
                if a['time']!=b['time'] or not math.isclose(a['value'],b['value'],rel_tol=1e-9,abs_tol=1e-8):errors.append(key+' numeric');break
        by_time={k:{p['time']:p['value'] for p in pts} for k,pts in expected.items()}
        for prefix in d['prefixes']:
            end=bars[prefix['position']-1]['time']
            for key,values_at_time in by_time.items():
                value=values_at_time.get(end);actual=prefix['last'][key]
                if (value is None)!=(actual is None) or value is not None and not math.isclose(value,actual,rel_tol=1e-9,abs_tol=1e-8):errors.append(key+' prefix')
        d['expected']=expected;p.write_text(json.dumps(d,indent=2),encoding='utf-8');results.append({'id':d['id'],'status':'failed' if errors else 'passed','points':points,'prefixes':len(d['prefixes']),'errors':errors})
    (root/'oracle.json').write_text(json.dumps(results,indent=2),encoding='utf-8');print(json.dumps({'datasets':len(results),'points':sum(r['points'] for r in results),'prefixes':sum(r['prefixes'] for r in results),'failed':[r for r in results if r['status']=='failed']},indent=2));return any(r['status']=='failed' for r in results)
if __name__=='__main__':
    if sys.argv[1]=='--response':
        bars=json.loads(Path(sys.argv[2]).read_text(encoding='utf-8'));print(json.dumps(reference(bars)))
    else:sys.exit(audit(Path(sys.argv[1])))
