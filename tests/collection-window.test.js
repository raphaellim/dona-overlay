const test=require('node:test'),assert=require('node:assert/strict');
const {captureReason}=require('../collection-window');
const live={live:true,status:'live',startedAt:'2026-10-14T12:00:00Z'},station={id:'s1',slug:'test'};
test('ready/ended skip; start boundary, switched broadcast, replay and reactivation boundary',()=>{
 const e={receivedAt:'2026-10-14T12:01:00Z'};
 assert.equal(captureReason({},e,'b1'),'broadcast_not_live');assert.equal(captureReason({...live,live:false,status:'ended'},e,'b1'),'broadcast_not_live');assert.equal(captureReason(live,e,'b1'),'');assert.equal(captureReason(live,{receivedAt:'2026-10-14T11:59:59Z'},'b1'),'outside_broadcast_window');assert.equal(captureReason(live,{...e,broadcastId:'b1'},'b2'),'previous_broadcast');assert.equal(captureReason(live,{...e,replay:true},'b1'),'replay');assert.equal(captureReason({...live,collectionStartedAt:'2026-10-14T12:02:00Z'},e,'b1'),'outside_broadcast_window');
});
test('ingestion saves only current live broadcast, discards paused and delayed inputs, checks switch/end during preparation',async()=>{
 let active={id:'b1'},state={...live},inserted=[],duringPrepare;
 const service=require('../capture-test')({get(){},post(){}},{supabase:{from(){return {insert(p){inserted.push(p);return {select(){return {single:async()=>({data:p})}}}}}}},getStation(){},getStationContext(){},managerAllowed(){},stationAllowed(){},notify(){},ensureActiveBroadcast:async()=>active,readEffectiveSettings:async()=>({broadcastLiveData:state}),review:{prepare:async(source,b,s,bound)=>{if(duringPrepare)duringPrepare();return {broadcast_id:bound.id,routing:{state:'review'},status:'pending'}},auto:async()=>{}}});
 const event={donor:'후원자',amount:1000,eventId:'e1',receivedAt:'2026-10-14T12:01:00Z'};
 state={...live,status:'ended',live:false};assert.equal((await service.saveAccount(event,station)).skipped,true);assert.equal(inserted.length,0);
 state={...live};await service.saveAccount(event,station);assert.equal(inserted[0].broadcast_id,'b1');
 active={id:'b2'};state={...live,startedAt:'2026-10-14T12:02:00Z'};assert.equal((await service.saveAccount(event,station)).reason,'outside_broadcast_window');
 await service.saveAccount({...event,eventId:'e2',receivedAt:'2026-10-14T12:03:00Z'},station);assert.equal(inserted[1].broadcast_id,'b2');
 duringPrepare=()=>active={id:'b3'};assert.equal((await service.saveAccount({...event,receivedAt:'2026-10-14T12:04:00Z'},station)).reason,'broadcast_changed');
 duringPrepare=()=>state={...state,live:false,status:'ended'};assert.equal((await service.saveAccount({...event,receivedAt:'2026-10-14T12:04:00Z'},station)).reason,'broadcast_not_live');assert.equal(inserted.length,2);
});
