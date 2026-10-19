'use strict';
module.exports=function(app,{route,supabase,withSettingsMutation,getStationContext,readEffectiveSettings,notify}){
 app.post('/api/mobile-funding/resolve',route(async(req,res,c)=>{
  if(!supabase||!withSettingsMutation)throw Error('펀딩 서버 패치를 적용하세요');
  const id=String(req.body?.requestId||'');if(!/^[a-f0-9-]{36}$/i.test(id))throw Error('요청 ID를 확인하세요');
  const applied=await withSettingsMutation(async()=>{const {data,error}=await supabase.from('settings').select('data').eq('id',3).maybeSingle();if(error)throw error;const root=data?.data||{},history=root.$mobileFundingChanges?.[c.station.slug]||[],found=history.find(x=>x.requestId===id);if(found)return !found.cancelled;
   root.$mobileFundingChanges={...root.$mobileFundingChanges,[c.station.slug]:[...history.slice(-499),{requestId:id,cancelled:true,at:new Date().toISOString()}]};const saved=await supabase.from('settings').upsert({id:3,data:root,updated_at:new Date().toISOString()},{onConflict:'id'});if(saved.error)throw saved.error;return false;});
  res.json({ok:true,applied,fundingData:(await readEffectiveSettings(c.station.slug,c.active.id)).fundingData});
 },true));
 app.post('/api/mobile-funding/adjust',route(async(req,res,c)=>{
  if(!supabase||!withSettingsMutation)throw Error('펀딩 서버 연결 패치를 적용하세요');
  const b=req.body||{},amount=Number(b.amount),donor=String(b.donor||'').trim(),fundingId=String(b.fundingId||''),requestId=String(b.requestId||'');
  if(!/^[a-f0-9-]{36}$/i.test(requestId)||!Number.isSafeInteger(amount)||amount<1||amount>1e9||!donor||donor.length>100||!['plus','minus'].includes(b.direction))throw Error('후원자명·금액·추가/차감을 확인하세요');
  if(String(b.broadcastId)!==String(c.active.id))throw Error('방송이 변경됐습니다. 현재 방송을 확인하세요');
  const signature=JSON.stringify([String(c.active.id),fundingId,amount,b.direction,donor]);
  const result=await withSettingsMutation(async()=>{
   const current=await getStationContext(req,res);if(!current||String(current.active.id)!==String(c.active.id))throw Error('현재 방송이 변경되었습니다');
   const {data,error}=await supabase.from('settings').select('data').eq('id',3).maybeSingle();if(error)throw error;const root=data?.data||{};
   const history=root.$mobileFundingChanges?.[c.station.slug]||[];const found=history.find(x=>x.requestId===requestId);if(found){if(found.cancelled)throw Error('취소한 요청입니다. 새 요청으로 반영하세요');if(found.signature!==signature)throw Error('같은 요청 ID의 내용이 다릅니다');return{duplicate:true};}
   const effective=await readEffectiveSettings(c.station.slug,c.active.id);if(effective.broadcastLiveData?.live!==true||effective.broadcastLiveData?.status!=='live')throw Error('방송시작 상태에서 반영하세요');
   const bucket=root.stationSettings?.[c.station.slug]||{},shared=bucket._shared||{};const funding=JSON.parse(JSON.stringify(shared.fundingData??root.fundingData??{items:[]}));const fund=(funding.items||[]).find(f=>f.id===fundingId&&f.enabled!==false);if(!fund)throw Error('사용 중인 펀딩을 선택하세요');
   const before=Math.round(Number(fund.current||0)*10000),delta=b.direction==='minus'?-amount:amount;if(!Number.isSafeInteger(before)||before+delta<0)throw Error('현재 펀딩 금액보다 많이 차감할 수 없습니다');fund.current=(before+delta)/10000;
   root.stationSettings={...root.stationSettings,[c.station.slug]:{...bucket,_shared:{...shared,fundingData:funding}}};
   const record={requestId,signature,broadcastId:String(c.active.id),fundingId,donor,delta,before,after:before+delta,at:new Date().toISOString()};root.$mobileFundingChanges={...root.$mobileFundingChanges,[c.station.slug]:[...history.slice(-499),record]};
   const saved=await supabase.from('settings').upsert({id:3,data:root,updated_at:new Date().toISOString()},{onConflict:'id'});if(saved.error)throw saved.error;
   return{duplicate:false,fundingData:funding,record,title:fund.title};
  });
  if(!result.duplicate){await Promise.resolve(notify(c.station.slug,'funding',{id:'mobile-funding:'+requestId,broadcastId:String(c.active.id),donor,title:result.title,delta:result.record.delta})).catch(()=>{});await Promise.resolve(notify(c.station.slug,'state')).catch(()=>{});}
  res.json({ok:true,duplicate:result.duplicate,fundingData:result.fundingData||(await readEffectiveSettings(c.station.slug,c.active.id)).fundingData});
 },true));
};
