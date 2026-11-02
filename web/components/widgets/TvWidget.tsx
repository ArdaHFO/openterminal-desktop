"use client";

import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";

// Cheddar URL is the public player source on https://www.cheddar.com/.
// CNBC's full TV feed uses the broadcaster's own subscription/provider player.
export const CHANNELS = [
  { id: "bloomberg", label: "Bloomberg TV", url: "https://liveprodusphoenixeast.global.ssl.fastly.net/USPhx-HD/Channel-TX-USPhx-AWS-virginia-1/Source-USPhx-16k-1-s6lk2-BP-07-02-81ykIWnsMsg_live.m3u8", official:"https://www.bloomberg.com/live" },
  { id: "yahoo", label: "Yahoo Finance", url: "https://d1ewctnvcwvvvu.cloudfront.net/playlist.m3u8", official:"https://finance.yahoo.com/videos/" },
  { id: "cnbc", label: "CNBC", url: null, official:"https://www.cnbc.com/live-tv/" },
  { id: "cheddar", label: "Cheddar Business", url: "https://hls.livecdn.io/cheddar.com/cheddar/playlist.m3u8", official:"https://www.cheddar.com/watch/" },
  { id: "ndtv", label: "NDTV Profit", url: "https://ndtvprofit.akamaized.net/hls/live/2107404/ndtvprofit/master_1.m3u8", official:"https://www.ndtvprofit.com/live-tv" },
] as const;

const selectedChannels=new Map<string,string>();
type Phase='loading'|'playing'|'paused'|'blocked'|'error';
export default function TvWidget({widgetId}:{widgetId:string}) {
  const [channel, setChannel] = useState<(typeof CHANNELS)[number]>(()=>CHANNELS.find(c=>c.id===selectedChannels.get(widgetId))??CHANNELS[0]);
  const [phase,setPhase]=useState<Phase>('loading');
  const [error, setError] = useState<string | null>(null);
  const [attempt,setAttempt]=useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !channel.url) return;
    let active=true,networkRecoveries=0,mediaRecoveries=0;
    setError(null);setPhase('loading');
    const fail=(detail:string)=>{if(active){setError(detail);setPhase('error');}};
    const play=()=>video.play().catch(e=>{if(!active)return;if(e?.name==='NotAllowedError')setPhase('blocked');else if(e?.name!=='AbortError')fail('Playback could not start. Retry or open the official player.');});
    const playing=()=>{if(active){setError(null);setPhase('playing');}};
    const waiting=()=>{if(active)setPhase('loading');};
    const paused=()=>{if(active&&!video.ended)setPhase('paused');};
    const failed=()=>fail('Video playback failed. Retry or open the official player.');
    const ended=()=>fail('The live stream ended. Retry or open the official player.');
    video.addEventListener('playing',playing);video.addEventListener('waiting',waiting);video.addEventListener('pause',paused);video.addEventListener('error',failed);video.addEventListener('ended',ended);
    let hls:Hls|undefined;
    if (Hls.isSupported()) {
      hls = new Hls();
      hls.on(Hls.Events.MANIFEST_PARSED, play);
      hls.on(Hls.Events.ERROR, (_evt, data) => {
        if(!active||!data.fatal)return;
        if(data.type===Hls.ErrorTypes.NETWORK_ERROR&&networkRecoveries++<2){setPhase('loading');hls?.startLoad();return;}
        if(data.type===Hls.ErrorTypes.MEDIA_ERROR&&mediaRecoveries++<1){setPhase('loading');hls?.recoverMediaError();return;}
        hls?.stopLoad();fail(`Stream unavailable (${data.details}). Retry or open the official player.`);
      });
      hls.loadSource(channel.url);hls.attachMedia(video);
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = channel.url;void play();
    } else fail("Your browser doesn't support HLS playback. Open the official player.");
    return () => {
      active=false;hls?.destroy();
      video.removeEventListener('playing',playing);video.removeEventListener('waiting',waiting);video.removeEventListener('pause',paused);video.removeEventListener('error',failed);video.removeEventListener('ended',ended);
      video.pause();video.removeAttribute('src');video.load();
    };
  }, [channel,attempt]);
  useEffect(()=>{
    if(phase!=='loading'||!channel.url)return;
    const timer=setTimeout(()=>{setError('The stream did not start or stopped buffering. Retry or open the official player.');setPhase('error');},25000);
    return()=>clearTimeout(timer);
  },[phase,channel,attempt]);

  return <div className="flex flex-col h-full min-h-0" data-testid="tv-player">
    <div className="flex gap-1 p-1 flex-wrap shrink-0" role="group" aria-label="TV channels">
      {CHANNELS.map(c=><button key={c.id} aria-pressed={channel.id===c.id} className={`term-btn ${channel.id===c.id?'active':''}`} onClick={()=>{selectedChannels.set(widgetId,c.id);if(c.id===channel.id){setAttempt(n=>n+1);}else setChannel(c);setError(null);setPhase('loading');}}>{c.label}</button>)}
    </div>
    <div className="p-1 flex gap-2 items-center flex-wrap shrink-0">
      <span role="status" data-testid="tv-status">{channel.label} · {channel.url?phase==='playing'?'Playing':phase==='loading'?'Connecting…':phase==='paused'?'Paused':phase==='blocked'?'Press Play to start':'Playback unavailable':'Official player'}</span>
      <a className="term-btn" href={channel.official} target="_blank" rel="noopener noreferrer">Open {channel.label} official player</a>
      {channel.url&&<button className="term-btn" onClick={()=>setAttempt(n=>n+1)}>Retry stream</button>}
    </div>
    <div className="relative flex-1 min-h-0 bg-black">
      {channel.url?<>
        <video aria-label={`${channel.label} live video`} ref={videoRef} className="w-full h-full" autoPlay muted controls playsInline />
        {phase==='loading'&&<div className="absolute top-2 left-2 bg-black p-1 dim pointer-events-none">Connecting to broadcaster…</div>}
        {phase==='blocked'&&<button className="absolute top-2 left-2 term-btn" onClick={()=>videoRef.current?.play().catch(()=>{setError('Playback could not start. Use the official player.');setPhase('error');})}>Play stream</button>}
        {phase==='error'&&<div role="alert" className="absolute inset-0 flex items-center justify-center p-4 text-center dim bg-black pointer-events-none">{error}</div>}
      </>:<div className="p-4 dim" data-testid="tv-official-notice">CNBC full live TV uses its official player and may require a CNBC+ subscription or supported TV-provider sign-in. A verified free embeddable CNBC TV feed is not configured. Use “Open CNBC official player” above. Availability depends on the broadcaster and your region.</div>}
    </div>
  </div>;
}
