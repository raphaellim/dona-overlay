'use strict';
// Mounted inside alert-studio.js so the existing administrator authorization and station context are reused.
module.exports=function(app,{route,read,readEffectiveSettings,jobs,notify,makeFreeRandomPlan,matchIntro,getStationContext,match,supabase,withSettingsMutation}){
 require('./mobile-funding-controls')(app,{route,supabase,withSettingsMutation,getStationContext,readEffectiveSettings,notify});
 const locks=new Map();
 async function serial(key,fn){const prev=locks.get(key)||Promise.resolve();const next=prev.catch(()=>{}).then(fn);locks.set(key,next);try{return await next;}finally{if(locks.get(key)===next)locks.delete(key);}}
 const validId=x=>typeof x==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(x);
 app.get('/api/mobile-alerts/catalog',route(async(req,res,c)=>{const config=await read(c.station.slug);res.json({ok:true,manualLiveAlerts:true,broadcastId:String(c.active.id),groups:config.groups||[],rules:(config.rules||[]).filter(r=>r.enabled!==false).map(({id,title,groupId,min,max,type})=>({id,title,groupId,min,max,type}))});},true));
 app.post('/api/mobile-alerts/batch',route(async(req,res,c)=>serial(c.station.slug,async()=>{
  const body=req.body||{},accepted=[];
  if(String(body.broadcastId)!==String(c.active.id))throw Error('방송이 변경됐습니다. 담은 목록을 확인하고 다시 등록하세요');
  if(!Array.isArray(body.entries)||!body.entries.length||body.entries.length>100)throw Error('알람 목록을 확인하세요');
  const config=await read(c.station.slug);
  if(config.deliveryMode!=='dedicated'||!config.enabled)throw Error('웹에서 독립 알림 모드를 켜고 저장하세요');
  const settings=await readEffectiveSettings(c.station.slug,c.active.id);if(settings.broadcastLiveData?.live!==true||settings.broadcastLiveData?.status!=='live')throw Error('방송시작 상태에서 전송하세요');
  let total=0;const seen=new Set();const prepared=body.entries.map(item=>{
   if(!item||!validId(item.requestId)||seen.has(item.requestId)||!['amount','rule','random'].includes(item.kind)||!Number.isSafeInteger(item.count)||item.count<1||item.count>50)throw Error('요청 ID·횟수·알람 종류를 확인하세요');if(item.delivery!==undefined&&!['test','live'].includes(item.delivery))throw Error('전송 모드를 확인하세요');seen.add(item.requestId);total+=item.count;if(total>100)throw Error('한 번에 100회까지 전송하세요');
   if(item.kind==='random'){const plan=makeFreeRandomPlan(config,item.count,item.groupId);return{item,plan};}
   if(config.accountEnabled===false)throw Error('계좌 알람 사용을 켜세요');
   const rule=item.kind==='amount'?(match||require('./alert-studio').match)(config,item.amount):(config.rules||[]).find(r=>r.id===item.ruleId&&r.enabled!==false);if(!rule)throw Error('선택한 알람이 삭제되었거나 꺼져 있습니다');
   if(!Number.isSafeInteger(item.amount)||item.amount<1000||item.amount>1e9||typeof item.donor!=='string'||!item.donor.trim()||item.donor.length>100)throw Error('표시 이름·금액을 확인하세요');
   return{item,rule};
  });
  // Stable event keys let a timed-out request reuse the same jobs.put deduplication used by free-random.
  for(const {item,rule,plan} of prepared){try{
   const current=await getStationContext(req,res);if(!current||String(current.active.id)!==String(c.active.id))throw Error("현재 방송이 변경되어 전송을 멈췄습니다");const latest=await readEffectiveSettings(c.station.slug,c.active.id);if(latest.broadcastLiveData?.live!==true||latest.broadcastLiveData?.status!=='live')throw Error('방송이 중지되어 나머지 전송을 멈췄습니다');
   if(plan){const id='mobile-random:'+item.requestId;await jobs.put('alert',c.station.slug,c.active.id,id,{id,kind:'freeRandom',source:'free',donor:'',amount:0,message:'',preview:item.delivery!=='live',manualRelease:false,mobileTitle:'그룹 랜덤',freeRandomGroupId:item.groupId,randomPlan:plan,media:plan.pool[0]});}
   else for(let i=0;i<item.count;i++){const id=(item.delivery==='live'?'mobile-manual:':'mobile-test:')+item.requestId+':'+i;await jobs.put('alert',c.station.slug,c.active.id,id,{id,preview:item.delivery!=='live',source:'account',donor:item.donor.trim(),amount:item.amount,message:item.delivery==='live'?'':'앱 계좌 알람 테스트',receivedAt:new Date().toISOString(),manualRelease:false,mobileTitle:rule.title,media:{image:rule.image||'',sound:rule.sound||'',showText:rule.showText!==false,introSound:matchIntro(config,item.amount)}});}
   accepted.push(item.requestId);
  }catch(e){await Promise.resolve(notify(c.station.slug,'alertWake')).catch(()=>{});return res.json({ok:true,accepted,remaining:body.entries.length-accepted.length,message:'일부 전송 확인 필요: '+e.message+' · 남은 목록은 같은 요청 ID로 재전송하세요'});}}
  await Promise.resolve(notify(c.station.slug,'alertWake')).catch(()=>{});await Promise.resolve(notify(c.station.slug,'alertList')).catch(()=>{});
  res.json({ok:true,accepted,count:total,message:total+'회 알람을 서버 대기목록에 등록했습니다. 자동재생 설정에 따라 재생됩니다.'});
 }),true));
};
