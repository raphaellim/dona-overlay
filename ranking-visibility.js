'use strict';
// Display-only short leases, scoped by station + broadcast + player. No donation/queue/settings writes.
const LEASE=35000,MAX=256;
module.exports=function(app,{ctx,notify,now=Date.now}){const entries=new Map();
 function prune(){const time=now();for(const [key,v]of entries)if(v.until<=time)entries.delete(key);}
 function snapshot(c){prune();const list=[...entries.values()].filter(v=>v.station===c.station.id&&v.broadcast===String(c.active.id)&&v.active&&v.amount>=5000);return {hidden:list.length>0,until:list.length?Math.max(...list.map(v=>v.until)):0,threshold:5000};}
 app.get('/api/donor-ranking/visibility',async(req,res)=>{try{const c=await ctx(req,res,false);if(c){res.set('Cache-Control','no-store');res.json(snapshot(c));}}catch(e){res.status(400).json({error:'순위판 표시 상태 확인 실패'});}});
 app.post('/api/donor-ranking/visibility',async(req,res)=>{try{const c=await ctx(req,res,false);if(!c)return;const b=req.body||{},player=String(b.playerId||''),seq=Number(b.seq),amount=Number(b.amount||0);if(!/^[\w:-]{8,100}$/.test(player)||!Number.isSafeInteger(seq)||seq<1||typeof b.active!=='boolean'||!Number.isSafeInteger(amount)||amount<0||amount>1e9)return res.status(400).json({error:'알람 표시 상태 형식 오류'});if(b.broadcastId&&String(b.broadcastId)!==String(c.active.id))return res.json({ok:true,ignored:true});
 prune();const key=c.station.id+':'+c.active.id+':'+player,old=entries.get(key);if(old&&seq<=old.seq)return res.json({ok:true,ignored:true});if(!old&&entries.size>=MAX)return res.status(429).json({error:'표시 연결 수 초과'});
 const active=b.active&&amount>=5000,value={station:c.station.id,broadcast:String(c.active.id),seq,active,amount,until:now()+LEASE};entries.set(key,value);if(!old||old.active!==active||old.amount!==amount)notify(c.station.slug,'rankingVisibility');res.set('Cache-Control','no-store');res.json({ok:true,...snapshot(c)});
 }catch(e){res.status(400).json({error:'순위판 표시 상태 전송 실패'});}});return {snapshot};};
