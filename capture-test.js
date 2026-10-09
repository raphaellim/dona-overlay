const crypto=require('crypto');
module.exports=function(app,{supabase,getStation,getStationContext,managerAllowed,stationAllowed}){
 const auth=async(req,res)=>{const ctx=await getStationContext(req,res);if(!ctx)return null;if(!await managerAllowed(req,ctx.station,ctx.active)){res.status(401).json({error:'방송국 관리자 또는 방송매니저로 로그인하세요.'});return null;}return ctx;};
 const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
 const admin=async(req,res)=>{const ctx=await getStationContext(req,res);if(!ctx)return null;if(!await stationAllowed(req,ctx.station)){res.status(403).json({error:'방송국 관리자 권한 필요'});return null;}return ctx;};
 app.get('/api/station/collection-token',async(req,res)=>{try{const ctx=await admin(req,res);if(!ctx)return;const {data,error}=await supabase.from('station_collection_tokens').select('updated_at').eq('station_id',ctx.station.id).maybeSingle();if(error)throw error;res.json({issued:!!data,updatedAt:data?.updated_at||null});}catch(e){res.status(500).json({error:e.message});}});
 app.post('/api/station/collection-token',async(req,res)=>{try{const ctx=await admin(req,res);if(!ctx)return;const token=crypto.randomBytes(32).toString('base64url');const {error}=await supabase.from('station_collection_tokens').upsert({station_id:ctx.station.id,token_hash:hash(token),updated_at:new Date().toISOString()},{onConflict:'station_id'});if(error)throw error;res.set('Cache-Control','no-store');res.json({token});}catch(e){res.status(500).json({error:e.message});}});
 async function save(source,b,station){
 const donor=String(b.donor||'').trim(),amount=Number(b.amount),eventId=String(b.eventId||'');
 if(/테스트/i.test(donor+' '+(b.title||'')+' '+(b.message||'')))return {ok:true,skipped:true,reason:'test'};
 if(!donor||donor.length>100||!Number.isSafeInteger(amount)||amount<=0||amount>1e9||!eventId||eventId.length>200)throw new Error('후원자·금액·이벤트 ID 확인 필요');
 const at=new Date(b.receivedAt);if(!Number.isFinite(at.getTime()))throw new Error('수신 시각 확인 필요');
 const {error}=await supabase.from('donation_capture_candidates').insert({station_id:station.id,source,event_id:eventId,donor,amount,title:String(b.title||'').slice(0,100),message:String(b.message||'').slice(0,1000),bank:String(b.bank||'').slice(0,30),creator:String(b.creator||'').slice(0,100),received_at:at.toISOString(),replay:!!b.replay});
 if(error){if(error.code==='23505')return {ok:true,duplicate:true};throw error;}return {ok:true,pending:true};
 }
 for(const source of ['account','toonie']){
 app.post('/api/'+source+'-candidates',async(req,res)=>{try{
 if(!supabase)return res.status(503).json({error:'DB 연결 필요'});
 const b=req.body||{},given=String(req.headers['x-auto-donation-token']||'');
 if(!given||given.length>200)return res.status(401).json({error:'방송국 수집 토큰 오류'});
 const station=await getStation(String(b.station||'default'));if(!station)return res.status(401).json({error:'방송국 수집 토큰 오류'});
 const {data,error}=await supabase.from('station_collection_tokens').select('token_hash').eq('station_id',station.id).maybeSingle();if(error)throw error;
 const actual=hash(given);if(!data||typeof data.token_hash!=='string'||data.token_hash.length!==actual.length||!crypto.timingSafeEqual(Buffer.from(actual),Buffer.from(data.token_hash)))return res.status(401).json({error:'방송국 수집 토큰 오류'});
 res.json(await save(source,b,station));
 }catch(e){res.status(500).json({error:e.message});}});
 app.get('/api/'+source+'-candidates',async(req,res)=>{try{const ctx=await auth(req,res);if(!ctx)return;const {data,error}=await supabase.from('donation_capture_candidates').select('*').eq('station_id',ctx.station.id).eq('source',source).eq('status','pending').order('received_at',{ascending:false}).limit(100);if(error)throw error;res.json({candidates:data||[]});}catch(e){res.status(500).json({error:e.message});}});
 app.post('/api/'+source+'-candidates/:id/dismiss',async(req,res)=>{try{const ctx=await auth(req,res);if(!ctx)return;const {data,error}=await supabase.from('donation_capture_candidates').update({status:'dismissed'}).eq('station_id',ctx.station.id).eq('source',source).eq('id',req.params.id).eq('status','pending').select('id').maybeSingle();if(error)throw error;if(!data)return res.status(409).json({error:'이미 삭제됨'});res.json({ok:true});}catch(e){res.status(500).json({error:e.message});}});
 }
 return {saveAccount:(b,station)=>save('account',b,station),ingestToonie:async b=>{const station=await getStation(String(b.station||''));if(!station)throw new Error('방송국 없음');return save('toonie',b,station);}};
};
