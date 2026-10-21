'use strict';
// Reuse alert-studio's existing administrator checks and station/broadcast context.
module.exports=function(app,{supabase,route,read,enqueue,notify,readEffectiveSettings}){
 const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
 app.get('/api/mobile-receipts',route(async(req,res,c)=>{
  const page=Number(req.query.page||0);if(!Number.isSafeInteger(page)||page<0||page>10000)throw Error('페이지 확인 필요');
  const {data,error}=await supabase.from('donation_capture_candidates').select('id,donor,amount,received_at,status,routing,message').eq('station_id',c.station.id).eq('broadcast_id',c.active.id).eq('source','account').neq('status','dismissed').order('received_at',{ascending:false}).order('id',{ascending:false}).range(page*50,page*50+50);if(error)throw error;
  res.set('Cache-Control','no-store');res.json({ok:true,broadcastId:String(c.active.id),broadcastTitle:c.active.title||'',hasMore:(data||[]).length>50,receipts:(data||[]).slice(0,50).map(r=>({id:r.id,donor:r.routing?.receiptDonor||r.routing?.donor||r.donor,amount:Number(r.amount),receivedAt:r.received_at,status:r.status,message:r.message||''}))});
 },true));
 app.post('/api/mobile-receipts/replay',route(async(req,res,c)=>{
  const body=req.body||{};if(String(body.broadcastId)!==String(c.active.id))throw Error('방송이 변경됐습니다. 목록을 새로고침하세요');if(!uuid(body.receiptId)||!uuid(body.requestId))throw Error('입금·요청 ID 확인 필요');
  const {data:r,error}=await supabase.from('donation_capture_candidates').select('id,donor,amount,received_at,status,routing,message,title').eq('station_id',c.station.id).eq('broadcast_id',c.active.id).eq('source','account').eq('id',body.receiptId).maybeSingle();if(error)throw error;if(!r||r.status==='dismissed')throw Error('현재 방송 입금 내역을 찾을 수 없습니다');
  const config=await read(c.station.slug);if(config.deliveryMode!=='dedicated'||!config.enabled||config.accountEnabled===false)throw Error('독립 계좌 알림을 켜고 저장하세요');if(!Number.isSafeInteger(Number(r.amount))||Number(r.amount)<1000)throw Error('1,000원 미만은 재알림 제외입니다');
  const settings=await readEffectiveSettings(c.station.slug,c.active.id);if(settings.broadcastLiveData?.live!==true||settings.broadcastLiveData?.status!=='live')throw Error('방송 시작 상태에서 재알림하세요');
  // This path only queues an alert; it never invokes capture, approval, or donation writes.
  const id='mobile-receipt-replay:'+r.id+':'+body.requestId;await enqueue(c.station.slug,{id,source:'account',preview:true,replayed:true,manualRelease:true,donor:r.routing?.receiptDonor||r.routing?.donor||r.donor,amount:Number(r.amount),message:r.message||'',title:r.title||'',receivedAt:r.received_at},c.active.id);
  await Promise.resolve(notify(c.station.slug,'alertWake')).catch(()=>{});res.json({ok:true,message:'재알림을 등록했습니다. 입금 합계는 변경하지 않습니다.'});
 },true));
};
