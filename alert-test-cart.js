'use strict';
const crypto=require('crypto'),studioHelpers=require('./alert-studio');
const validId=v=>/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(String(v||''));
function build(config,body){if(!validId(body.requestId)||!Array.isArray(body.items)||!body.items.length||body.items.length>30)throw Error('장바구니는 1~30개 항목을 담으세요.');let total=0;const used=new Set();return body.items.map(item=>{if(!validId(item.id)||used.has(item.id))throw Error('장바구니 항목 ID 중복 또는 형식 오류');used.add(item.id);const count=Number(item.count);if(!Number.isSafeInteger(count)||count<1||count>100||(total+=count)>100)throw Error('한 번에 총 100회까지 전송하세요.');let media,randomPlan,amount=0;
 if(item.type==='amount'){amount=Number(item.amount);if(!Number.isSafeInteger(amount)||amount<1000||amount>1e9)throw Error('테스트 금액은 1,000원 이상으로 입력하세요.');media=studioHelpers.match(config,amount);randomPlan=studioHelpers.makeRandomPlan(config,amount,'account');if(randomPlan&&randomPlan.count>100)throw Error('금액 랜덤은 100회 이하로 입력하세요.');}
 else if(item.type==='rule'){media=(config.rules||[]).find(r=>r.id===item.ruleId&&r.enabled!==false);if(!media)throw Error('사용 중인 알람을 선택하세요.');amount=Number(media.min);if(!Number.isSafeInteger(amount)||amount<1000)throw Error('선택한 알람의 금액은 1,000원 이상이어야 합니다.');}
 else if(item.type==='group'){randomPlan=studioHelpers.makeFreeRandomPlan(config,count,item.groupId);media=randomPlan.pool[0];}
 else throw Error('테스트 알람 종류 확인 필요');
 const clean=m=>({id:m?.id,title:String(m?.title||'테스트'),image:m?.image||'',sound:m?.sound||'',showText:m?.showText!==false});
 // Snapshot only existing registered media. Never accept client-provided media paths.
 const payload={preview:true,testCart:true,kind:item.type==='group'?'freeRandom':'donation',source:item.type==='group'?'free':'account',donor:item.type==='group'?'':'테스트',amount,message:item.type==='group'?'':'이미지·음원 테스트',manualRelease:true,media:{...clean(media),introSound:item.type==='group'?'':studioHelpers.matchIntro(config,amount)},receivedAt:new Date().toISOString()};
 if(randomPlan)payload.randomPlan={...randomPlan,pool:randomPlan.pool.map(clean)};
 return {itemId:item.id,count:item.type==='group'?1:count,payload};
 });}
module.exports=function(app,d){const {supabase,getStationContext,stationAllowed,readStudio,notify}=d;
 app.post('/api/alert-test-cart',async(req,res)=>{try{const c=await getStationContext(req,res);if(!c)return;if(!await stationAllowed(req,c.station))return res.status(403).json({error:'방송국 관리자만 테스트 알람을 전송할 수 있습니다.'});const config=await readStudio(c.station.slug);if(config.deliveryMode!=='dedicated'||!config.enabled||config.accountEnabled===false)throw Error('독립 알림·계좌 알림 사용을 켜고 저장하세요.');const plans=build(config,req.body||{});let totalPlays=0;for(const p of plans)totalPlays+=p.count*(p.payload.randomPlan?.count||1);if(totalPlays>100)throw Error('랜덤 반복을 포함해 한 번에 총 100회까지만 전송하세요.');
 const rows=[];for(const p of plans)for(let i=0;i<p.count;i++){const id='test-cart:'+req.body.requestId+':'+p.itemId+':'+i;rows.push({kind:'alert',station:c.station.slug,broadcast:String(c.active.id),event_key:id,payload:{...p.payload,id,broadcastId:c.active.id}});}
 // One atomic INSERT; the same request ID can be retried without duplicate jobs.
 const {error}=await supabase.from('overlay_runtime_jobs').upsert(rows,{onConflict:'station,kind,event_key',ignoreDuplicates:true});if(error)throw error;notify(c.station.slug,'alertWake');notify(c.station.slug,'alertList');res.json({ok:true,jobs:rows.length,plays:totalPlays});
 }catch(e){res.status(400).json({error:e.message});}});
};module.exports.build=build;
