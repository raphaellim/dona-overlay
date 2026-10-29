const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm');const {ledgerRows,donorRows}=require('../account-receipts');
const receipt={id:'r1',source:'account',status:'pending',amount:50000,donor:'열려',received_at:'2026-10-14T12:01:00Z',routing:{receiptFirst:true,receiptDonor:'열려'}};
test('pending bank receipt counts immediately, allocations do not double-count; dismissed and duplicate receipts excluded',()=>{
 const before=donorRows(ledgerRows([], [receipt]));assert.equal(before[0].amount,50000);
 const split=[{captureId:'r1',donor:'열려',accountAmount:30000},{captureId:'r1',donor:'열려',accountAmount:20000}];assert.equal(donorRows(ledgerRows(split,[{...receipt,status:'applied'},receipt]))[0].amount,50000);
 assert.equal(ledgerRows([],[{...receipt,status:'dismissed'}]).length,0);assert.equal(donorRows(ledgerRows([...split,{donor:'수동',accountAmount:1000,createdAt:receipt.received_at}],[receipt])).length,2);
});
test('bank candidate retries publish receipt only once and remain awaiting allocation',async()=>{
 let stored,alerts=0,chats=0;
 const supabase={from(){return {insert(p){if(stored)return {select(){return {single:async()=>({error:{code:'23505'}})}}};stored={...p,id:'r1'};return {select(){return {single:async()=>({data:stored})}}};},select(){return this},eq(){return this},single:async()=>({data:stored})};}};
 const service=require('../capture-test')({get(){},post(){}},{supabase,ensureActiveBroadcast:async()=>({id:'b1'}),readEffectiveSettings:async()=>({broadcastLiveData:{status:'live',live:true,startedAt:'2026-10-14T12:00:00Z'}}),review:{prepare:async()=>({broadcast_id:'b1',status:'pending',routing:{receiptFirst:true,receiptDonor:'열려',state:'review'}}),auto:async r=>assert.equal(r.status,'pending')},notify(){},afterReceive:async()=>{alerts++;chats++;}});
 const event={donor:'열려',amount:50000,eventId:'same-bank-event',receivedAt:receipt.received_at},station={id:'s1',slug:'s'};
 await service.saveAccount(event,station);assert.equal((await service.saveAccount(event,station)).duplicate,true);assert.equal(alerts,1);assert.equal(chats,1);assert.equal(stored.broadcast_id,'b1');
});
test('production approval hook suppresses both alert and YouTube send for receipt-first allocations',async()=>{
 const s=fs.readFileSync(require.resolve('../server'),'utf8');const start=s.indexOf('afterApply:async(ctx,settings,candidate,routing,rows)=>{');const end=s.indexOf('\n}});',start);assert.ok(start>0&&end>start);const code=s.slice(start+'afterApply:'.length,end+2);let alerts=0,chats=0;const topics=[];
 const ctx={notifyCollection(slug,topic){topics.push(topic);if(topic==='alert')alerts++},nightbotChat:{enqueue(){}},maybeSendDonationYoutubeChat:async()=>{chats++},maybeStartAutoRoulette:async()=>{},console};vm.createContext(ctx);const hook=vm.runInContext('('+code+')',ctx);
 await hook({station:{slug:'s'},active:{id:'b1'}},{},{...receipt,source:'account'}, {},[]);assert.equal(alerts,0);assert.equal(chats,0);assert.deepEqual(topics,['distribution']);
 await hook({station:{slug:'s'},active:{id:'b1'}},{},{...receipt,routing:{}}, {},[]);assert.equal(alerts,1);assert.equal(chats,1);
});
