'use strict';
const crypto=require('crypto');
module.exports=function({supabase,withSettingsMutation,ensureActiveBroadcast,readEffectiveSettings}){
 const liveStamp=live=>String(live?.collectionStartedAt||live?.startedAt||'');
 async function read(){const {data,error}=await supabase.from('settings').select('data').eq('id',3).maybeSingle();if(error&&error.code!=='PGRST116')throw error;return data?.data&&typeof data.data==='object'?data.data:{};}
 async function change(deviceId,fn){return withSettingsMutation(async()=>{const data=await read();if(!data.$bankBroadcastLinks)data.$bankBroadcastLinks={};const key=String(deviceId),previous=Object.hasOwn(data.$bankBroadcastLinks,key)?data.$bankBroadcastLinks[key]:null;const next=fn(previous);if(next)data.$bankBroadcastLinks[key]=next;else delete data.$bankBroadcastLinks[key];const {error}=await supabase.from('settings').upsert({id:3,data,updated_at:new Date().toISOString()},{onConflict:'id'});if(error)throw error;return next;});}
 async function current(station){const broadcast=await ensureActiveBroadcast(station.id);const settings=await readEffectiveSettings(station.slug,broadcast.id);const live=settings.broadcastLiveData;return {broadcast,live,liveStamp:liveStamp(live),isLive:live?.live===true&&live?.status==='live'};}
 async function snapshot(device,station){const data=await read();const links=data.$bankBroadcastLinks||{},key=String(device.id),bound=Object.hasOwn(links,key)?links[key]:null;const now=await current(station);
  const valid=!!bound&&device.state==='linked'&&device.enabled===true&&now.isLive&&String(bound.stationId)===String(station.id)&&String(bound.broadcastId)===String(now.broadcast.id)&&bound.liveStamp===now.liveStamp;
  if(bound&&!valid)await change(device.id,old=>old?.sessionId===bound.sessionId?null:old);
  return {collectionProtocol:'broadcast-link-v1',deviceEnabled:device.enabled===true,broadcastId:String(now.broadcast.id),broadcastTitle:String(now.broadcast.title||now.broadcast.name||now.broadcast.id),broadcastLive:now.isLive,broadcastLiveStamp:now.liveStamp,collectionSessionId:valid?bound.sessionId:'',collectionConnectedAt:valid?bound.connectedAt:'',collectionActive:valid};
 }
 async function connect(device,station){if(device.state!=='linked'||device.enabled!==true)throw new Error('서버에서 이 기기의 수집을 허용해야 합니다.');const now=await current(station);if(!now.isLive||!now.liveStamp)throw new Error('진행 중인 방송을 시작한 뒤 방송 연결을 누르세요.');const bound={sessionId:crypto.randomUUID(),stationId:String(station.id),broadcastId:String(now.broadcast.id),liveStamp:now.liveStamp,connectedAt:new Date().toISOString()};await change(device.id,()=>bound);const result=await snapshot(device,station);if(!result.collectionActive||result.collectionSessionId!==bound.sessionId)throw new Error('방송 상태가 변경되었습니다. 다시 연결하세요.');return result;}
 async function disconnect(device,sessionId){if(!sessionId)return;await change(device.id,old=>old?.sessionId===sessionId?null:old);}
 async function accepts(device,station,body){const config=await snapshot(device,station);return config.collectionActive&&String(body.broadcastId||'')===config.broadcastId&&String(body.collectionSessionId||'')===config.collectionSessionId;}
 return {snapshot,connect,disconnect,accepts};
};
