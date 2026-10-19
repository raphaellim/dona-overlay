'use strict';
const assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),crypto=require('crypto');
const reference=fs.readFileSync(process.argv[2],'utf8');const start=reference.indexOf('function makeFreeRandomPlan('),end=reference.indexOf('function matchRandom(',start);const sandbox={crypto};vm.createContext(sandbox);vm.runInContext(reference.slice(start,end),sandbox);
const mount=require('../server-patch/mobile-alert-controls');
(async()=>{
 let bid='b1',live=true,config={deliveryMode:'dedicated',enabled:true,accountEnabled:true,groups:[{id:'normal',name:'일반시그'}],rules:[{id:'one',title:'시그1',groupId:'normal',enabled:true,sound:'/one.mp3',min:6500},{id:'off',title:'꺼짐',groupId:'normal',enabled:false,sound:'/off.mp3'}]};
 const routes={},records=new Map();let putCalls=0,failAt=0;
 mount({get:(p,f)=>routes[p]=f,post:(p,f)=>routes[p]=f},{route:(fn,admin)=>{assert.equal(admin,true);return async(req,res)=>{try{await fn(req,res,{station:{slug:'duugi'},active:{id:bid}});}catch(e){res.json({error:e.message});}};},read:async()=>config,readEffectiveSettings:async()=>({broadcastLiveData:{live,status:live?'live':'stopped'}}),getStationContext:async()=>({active:{id:bid}}),jobs:{put:async(kind,station,broadcast,id,payload)=>{if(++putCalls===failAt)throw Error('temporary');const key=station+':'+broadcast+':'+id;if(!records.has(key))records.set(key,payload);}},notify:()=>{},makeFreeRandomPlan:sandbox.makeFreeRandomPlan,matchIntro:()=>''});
 const invoke=async(path,body={})=>{let result;await routes[path]({body},{json:r=>result=r});return result;};
 const entry=()=>({requestId:crypto.randomUUID(),kind:'rule',ruleId:'one',count:5,amount:10000,donor:'테스트'});
 let r=await invoke('/api/mobile-alerts/catalog');assert.equal(r.rules.length,1);assert.equal(r.broadcastId,'b1');
 const item=entry(),body={broadcastId:'b1',entries:[item]};r=await invoke('/api/mobile-alerts/batch',body);assert.equal(r.count,5);assert.equal(records.size,5);for(const p of records.values()){assert.equal(p.preview,true);assert.equal(p.media.sound,'/one.mp3');assert.equal(p.manualRelease,false);}
 await invoke('/api/mobile-alerts/batch',body);assert.equal(records.size,5,'stable keys prevent repeat registration');
 const rand={requestId:crypto.randomUUID(),kind:'random',groupId:'normal',count:5};r=await invoke('/api/mobile-alerts/batch',{broadcastId:'b1',entries:[rand]});assert.equal(r.count,5);const p=[...records.values()].at(-1);assert.equal(p.randomPlan.count,5);assert.equal(p.randomPlan.pool.length,1);assert.equal(p.kind,'freeRandom');
 const before=records.size;r=await invoke('/api/mobile-alerts/batch',{broadcastId:'b2',entries:[entry()]});assert.match(r.error,/방송/);assert.equal(records.size,before);
 live=false;r=await invoke('/api/mobile-alerts/batch',{broadcastId:'b1',entries:[entry()]});assert.match(r.error,/방송시작/);live=true;
 r=await invoke('/api/mobile-alerts/batch',{broadcastId:'b1',entries:[{...entry(),ruleId:'off'}]});assert.match(r.error,/꺼져/);
 r=await invoke('/api/mobile-alerts/batch',{broadcastId:'b1',entries:[{...rand,groupId:'other'}]});assert.match(r.error,/그룹/);
 const partial={broadcastId:'b1',entries:[entry()]};failAt=putCalls+3;r=await invoke('/api/mobile-alerts/batch',partial);assert.equal(r.accepted.length,0);const halfway=records.size;failAt=0;r=await invoke('/api/mobile-alerts/batch',partial);assert.equal(r.accepted.length,1);assert.equal(records.size,halfway+3);
 r=await invoke('/api/mobile-alerts/batch',{broadcastId:'b1',entries:[{...entry(),count:51}]});assert.match(r.error,/횟수/);
 console.log('PASS: catalog, administrator routes, 5-item queue, retry keys, groups, broadcast gate, disabled rules, partial retry, limits');
})().catch(e=>{console.error(e);process.exitCode=1;});
