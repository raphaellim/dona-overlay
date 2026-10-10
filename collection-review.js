'use strict';
const {normalizeConfig,classify}=require('./donation-routing');
module.exports=function(app,d){
 const {supabase,getStationContext,managerAllowed,stationAllowed,ensureActiveBroadcast,readEffectiveSettings,saveEffectiveSettings,makeDonationRow,inputAllowedForActiveBroadcast,notify,afterApply}=d;
 async function context(req,res,admin=false){const ctx=await getStationContext(req,res);if(!ctx)return null;if(!await (admin?stationAllowed(req,ctx.station):managerAllowed(req,ctx.station,ctx.active))){res.status(403).json({error:'관리자 로그인 필요'});return null;}return ctx;}
 async function config(station,active){
  const settings=await readEffectiveSettings(station.slug,active.id);
  const {data,error}=await supabase.from('broadcast_collection_rules').select('config').eq('station_id',station.id).eq('broadcast_id',active.id).maybeSingle();if(error)throw error;
  let saved=data?.config;
  if(!saved){const {data:old,error:oldError}=await supabase.from('station_collection_rules').select('config').eq('station_id',station.id).maybeSingle();if(oldError)throw oldError;saved=old?.config;}
  const names=settings.creators||[];
  const c=normalizeConfig(saved||{mode:'collab',targets:names.map(name=>({name,group:'streamer',aliases:name==='빵떠기'?['떠기']:name==='또영이'?['또영']:[]}))});
  // Existing creator registration remains authoritative, group metadata enriches it.
  for(const name of names)if(!c.targets.some(t=>t.name===name))c.targets.push(normalizeConfig({targets:[{name,group:'streamer'}]}).targets[0]);
  if(names.length)c.targets=c.targets.filter(t=>names.includes(t.name));
  // A new broadcast always starts in review mode, even if a legacy station was solo.
  if(!data)c.mode='collab';return {...c,broadcastId:active.id};
 }
 async function prepare(source,b,station){const active=await ensureActiveBroadcast(station.id),cfg=await config(station,active);const routing=classify({...b,source},cfg);return {routing,broadcast_id:active.id,status:routing.state==='hold'?'hold':'pending'};}
 async function apply(candidate,ctx,routing){
  if(candidate.broadcast_id!==ctx.active.id)throw Error('이전 방송에서 수집된 내역 · 해당 방송으로 전환하여 확인하세요');
  if(!await inputAllowedForActiveBroadcast(ctx))throw Error('방송시작 상태에서만 반영 가능');
  const cfg=await config(ctx.station,ctx.active),valid=new Set(cfg.targets.filter(t=>t.active).map(t=>t.name));
  routing.rows=(routing.rows||[]).map(r=>{const t=r.targetId?cfg.targets.find(t=>t.id===r.targetId):cfg.targets.find(t=>t.name===r.creator);return {...r,creator:t?.name||r.creator,targetId:t?.id||r.targetId};});
  if(!routing.donor||routing.donor.length>100||!routing.rows?.length||routing.rows.some(r=>(r.targetId&&!cfg.targets.some(t=>t.id===r.targetId))||!valid.has(r.creator)||!Number.isSafeInteger(r.amount)||r.amount<=0)||routing.rows.reduce((n,r)=>n+r.amount,0)!==Number(candidate.amount))throw Error('대상·총후원금·분배 합계 확인 필요');
  if(new Set(routing.rows.map(r=>r.creator)).size!==routing.rows.length)throw Error('대상 중복');
  const settings=await readEffectiveSettings(ctx.station.slug,ctx.active.id);
  const funding=routing.fundingId?(settings.fundingData?.items||[]).find(f=>f.id===routing.fundingId):null;if(routing.fundingId&&!funding)throw Error('펀딩 대상 확인 필요');
  const rows=routing.rows.map(r=>{const row=makeDonationRow({donor:routing.donor,creator:r.creator,processType:routing.processType||'후원',rouletteRuleId:routing.rouletteRuleId||'',manualKind:funding?'funding':'',fundingId:funding?.id||'',fundingTitle:funding?.title||'',fundingBatchId:funding?'capture:'+candidate.id:'',sourceType:funding?'batch':'',exactWon:true,accountAmount:candidate.source==='account'?r.amount:'0',toonieAmount:candidate.source==='toonie'?r.amount:'0',memo:[candidate.title,candidate.message].filter(Boolean).join(' · ')},settings,ctx.station.id,ctx.active.id);
   // Existing manual input uses thousand-won shortcuts. Captured values are exact won.
   row.account_amount=candidate.source==='account'?r.amount:0;row.toonie_amount=candidate.source==='toonie'?r.amount:0;row.total_amount=r.amount;row.display_amount=String(r.amount/10000);const meta=row.checks.find(x=>x.meta)||{meta:true};Object.assign(meta,{captureId:candidate.id,targetId:r.targetId,title:candidate.title,vip:candidate.vip,receivedAt:candidate.received_at,message:candidate.message});if(!row.checks.includes(meta))row.checks.unshift(meta);return row;});
  const {data,error}=await supabase.rpc('apply_collection_candidate',{p_id:candidate.id,p_station:ctx.station.id,p_broadcast:ctx.active.id,p_rows:rows});if(error)throw error;
  if(!data.duplicate){notify(ctx.station.slug,'state');await afterApply(ctx,settings,candidate,routing,data.donations||[]);}
  notify(ctx.station.slug,'candidates');return data;
 }
 async function auto(candidate,station){if(candidate.routing?.state!=='auto'||candidate.status==='applied')return;
  const active=await ensureActiveBroadcast(station.id);try{return await apply(candidate,{station,active},candidate.routing);}catch(e){const {error}=await supabase.from('donation_capture_candidates').update({status:'hold',routing:{...candidate.routing,state:'hold',reason:e.message}}).eq('id',candidate.id).neq('status','applied');if(error)throw error;notify(station.slug,'candidates');}}
 app.get('/api/collection-history',async(req,res)=>{try{const ctx=await context(req,res);if(!ctx)return;const {data,error}=await supabase.from('donation_capture_candidates').select('*').eq('station_id',ctx.station.id).eq('broadcast_id',ctx.active.id).eq('status','applied').order('applied_at',{ascending:false}).limit(100);if(error)throw error;res.json({candidates:data||[]});}catch(e){res.status(400).json({error:e.message});}});
 app.get('/api/station/collection-rules',async(req,res)=>{try{const ctx=await context(req,res);if(ctx)res.json(await config(ctx.station,ctx.active));}catch(e){res.status(400).json({error:e.message});}});
 app.post('/api/station/collection-rules',async(req,res)=>{try{const ctx=await context(req,res,true);if(!ctx)return;const c=normalizeConfig(req.body);if(c.mode==='solo'&&c.targets.filter(t=>t.active&&t.group==='streamer').length!==1)throw Error('단독방송은 활성 방송인 1명만 선택하세요');const {error}=await supabase.from('broadcast_collection_rules').upsert({station_id:ctx.station.id,broadcast_id:ctx.active.id,config:c});if(error)throw error;const {error:catalogError}=await supabase.from('station_collection_rules').upsert({station_id:ctx.station.id,config:{...c,mode:'collab'}});if(catalogError)throw catalogError;await saveEffectiveSettings(ctx.station.slug,ctx.active.id,{creators:c.targets.map(t=>t.name)});notify(ctx.station.slug,'state');notify(ctx.station.slug,'rules');res.json({ok:true});}catch(e){res.status(400).json({error:e.message});}});
 for(const action of ['edit','approve'])app.post('/api/collection-candidates/:id/'+action,async(req,res)=>{try{
  const ctx=await context(req,res);if(!ctx)return;const {data:row,error}=await supabase.from('donation_capture_candidates').select('*').eq('station_id',ctx.station.id).eq('id',req.params.id).maybeSingle();if(error)throw error;if(!row||!['pending','hold'].includes(row.status))throw Error('처리할 대기 내역 없음');
  const routing={donor:String(req.body.donor||row.routing?.donor||row.donor).trim(),processType:String(req.body.processType||'후원'),fundingId:String(req.body.fundingId||''),rouletteRuleId:String(req.body.rouletteRuleId||''),rows:(req.body.rows||row.routing?.rows||[]).map(r=>({targetId:String(r.targetId||''),creator:String(r.creator||'').trim(),amount:Number(r.amount)})),state:'review',reason:'수동 수정 · 승인 대기'};
  if(action==='approve'){
   if(!row.broadcast_id&&req.body.adoptCurrent===true){const {error:bindError}=await supabase.from('donation_capture_candidates').update({broadcast_id:ctx.active.id}).eq('id',row.id).eq('station_id',ctx.station.id).is('broadcast_id',null).in('status',['pending','hold']);if(bindError)throw bindError;row.broadcast_id=ctx.active.id;}
   return res.json(await apply(row,ctx,routing));
  }
  const cfg=await config(ctx.station,ctx.active),valid=new Set(cfg.targets.map(t=>t.name));if(routing.rows.some(r=>(r.targetId&&!cfg.targets.some(t=>t.id===r.targetId))||!valid.has(r.creator)||!Number.isSafeInteger(r.amount)||r.amount<=0))throw Error('대상·원 단위 금액 확인 필요');
  const sum=routing.rows.reduce((n,r)=>n+r.amount,0);if(sum!==Number(row.amount)){routing.state='hold';routing.reason=`실제 ${row.amount}원 · 분배 ${sum}원 · 차액 ${Number(row.amount)-sum}원`;}
  const {error:updateError}=await supabase.from('donation_capture_candidates').update({routing,status:routing.state==='hold'?'hold':'pending'}).eq('id',row.id).in('status',['pending','hold']);if(updateError)throw updateError;notify(ctx.station.slug,'candidates');res.json({ok:true});
 }catch(e){res.status(400).json({error:e.message});}});
 return {prepare,auto};
};
