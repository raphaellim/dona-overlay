'use strict';
const crypto=require('node:crypto');
// Ephemeral display acknowledgements. No donation writes, no second collector.
module.exports=function(app,{route,supabase,invalidate,ackTimeout=3000,nativeTimeout=10000}){
 const viewers=new Map(),waiting=new Map(),MAX=128;
 const scope=c=>c.station.id+':'+c.active.id;
 function settle(id,w){if(w.ids.size)return;clearTimeout(w.timer);waiting.delete(id);w.resolve({ready:true,viewers:w.total});}
 function drop(key,v){if(viewers.get(key)!==v)return;viewers.delete(key);clearInterval(v.beat);for(const [id,w]of waiting)if(w.scope===v.scope){w.ids.delete(v.id);settle(id,w);}}
 app.get('/api/alert-display/stream',route(async(req,res,c)=>{
  const id=String(req.query.viewer||'');if(!/^[a-f0-9-]{36}$/i.test(id))return res.status(400).json({error:'화면 연결 ID 확인 필요'});
  const key=scope(c)+':'+id,old=viewers.get(key);if(old){old.res.end();drop(key,old);}if(viewers.size>=MAX)return res.status(429).json({error:'화면 연결 수 초과'});
  res.set({'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'});res.flushHeaders?.();
  const v={id,scope:scope(c),res};viewers.set(key,v);res.write('data: {"type":"ready"}\n\n');v.beat=setInterval(()=>{try{res.write(': keepalive\n\n');}catch{drop(key,v);}},20000);v.beat.unref?.();res.on('close',()=>drop(key,v));
 }));
 app.post('/api/alert-display/ack',route(async(req,res,c)=>{const b=req.body||{},w=waiting.get(String(b.revision||''));if(w&&w.scope===scope(c)&&b.applied===true){w.ids.delete(String(b.viewer||''));settle(String(b.revision),w);}res.json({ok:true});}));
 async function prepare(c){invalidate();const targets=[...viewers.values()].filter(v=>v.scope===scope(c));if(!targets.length)return {ready:true,viewers:0};if(waiting.size>=MAX)return {ready:false,reason:'busy'};
  const revision=crypto.randomUUID();let w;const done=new Promise(resolve=>{w={scope:scope(c),ids:new Set(targets.map(v=>v.id)),total:targets.length,resolve,timer:setTimeout(()=>{waiting.delete(revision);resolve({ready:false,reason:'display_timeout',viewers:targets.length});},ackTimeout)};waiting.set(revision,w);});
  for(const v of targets)try{v.res.write('data: '+JSON.stringify({type:'apply',revision,broadcastId:String(c.active.id)})+'\n\n');}catch{drop(v.scope+':'+v.id,v);}return done;
 }
 async function findNative(c,key){const run=()=>supabase.from('donation_capture_candidates').select('id,status,routing').eq('station_id',c.station.id).eq('broadcast_id',c.active.id).eq('source','toonie').contains('routing',{playbackKey:key}).order('received_at',{ascending:false}).limit(2);const r=await (supabase.uncached?supabase.uncached(run):run());if(r.error)throw r.error;if(r.data?.length>1)throw Error('동일 투네 이벤트 식별자 중복');return r.data?.[0];}
 app.post('/api/alert-display/prepare',route(async(req,res,c)=>{
  const b=req.body||{};if(b.broadcastId&&String(b.broadcastId)!==String(c.active.id))return res.status(409).json({error:'이전 방송 알림'});
  let capture;if(b.playbackKey!==undefined){if(!/^[a-f0-9]{64}$/.test(b.playbackKey))return res.status(400).json({error:'투네 이벤트 식별자 오류'});
   const until=Date.now()+nativeTimeout;while(Date.now()<until){if(res.destroyed)return;capture=await findNative(c,b.playbackKey);if(capture&&['applied','hold','dismissed'].includes(capture.status))break;await new Promise(r=>setTimeout(r,250));}
   if(!capture||!['applied','hold','dismissed'].includes(capture.status))return res.status(409).json({error:'투네 수집·프리셋 반영 확인 대기'});
  }
  const result=await prepare(c);res.set('Cache-Control','no-store');res.json({ok:true,...result,...(capture?{applied:capture.status==='applied',status:capture.status}:{})});
 }));
 return {prepare};
};
