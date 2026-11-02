import {sma,ema,rsi,bollinger,macd} from '../../web/lib/indicators';
import type {Candle} from '../../web/lib/api';
export function replayIndicatorSeries(bars:Candle[]){
 const b=bollinger(bars),m=macd(bars);
 return {SMA20:sma(bars,20),SMA50:sma(bars,50),SMA200:sma(bars,200),EMA20:ema(bars,20),RSI:rsi(bars),BOLL_U:b.upper,BOLL_M:b.middle,BOLL_L:b.lower,MACD:m.macd,SIGNAL:m.signal,HIST:m.histogram};
}
