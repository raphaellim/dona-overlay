'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),express=require('express'),http=require('node:http'),{EventEmitter}=require('node:events');
const create=require('../alert-display-sync');
function fixture(options={}){const app=express();app.use(express.json());let generation=0,capture=null;const ctx=req=>({station:{id:req.query.station||'s',slug:req.query.station||'s'},active:{id:req.query.broadcast||'b'}});const route=fn=>async(req,res)=>{try{await fn(req,res,ctx(req));}catch(e){res.status(400).json({error:e.message});}};
 const supabase={from(){const q={select(){return q},eq(){return q},contains(){return q},order(){return q},limit(){return q},then(ok){return Promise.resolve({data:capture?[capture]:[],error:null}).then(ok)}};return q},uncached:fn=>fn()};create(app,{route,supabase,invalidate:()=>generation++,ackTimeout:100,nativeTimeout:80,...options});return {app,get generation(){return generation},set capture(v){capture=v}};}
async function listen(app){const s=http.createServer(app);await new Promise(r=>s.listen(0,'127.0.0.1',r));return {s,url:'http://127.0.0.1:'+s.address().port};}
const post=(url,path,b)=>fetch(url+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)});
async function stream(url,station='s'){const controller=new AbortController(),res=await fetch(url+'/api/alert-display/stream?station='+station+'&viewer=11111111-1111-4111-8111-111111111111',{signal:controller.signal}),reader=res.body.getReader();await reader.read();return {controller,async next(){const {value}=await reader.read();const line=new TextDecoder().decode(value).split('\n').find(v=>v.startsWith('data: '));return JSON.parse(line.slice(6));}};}
test('Prepare waits for fresh overlay/render ACK, station isolated, timeout does not claim success',async()=>{
 const f=fixture(),{s,url}=await listen(f.app),a=await stream(url),other=await stream(url,'other');try{
 let finished=false;const p=post(url,'/api/alert-display/prepare',{}).then(r=>r.json()).then(r=>{finished=true;return r});const msg=await a.next();assert.equal(msg.type,'apply');assert.equal(f.generation,1);assert.equal(finished,false);
 await post(url,'/api/alert-display/ack?station=other',{viewer:'11111111-1111-4111-8111-111111111111',revision:msg.revision,applied:true});assert.equal(finished,false);
 await post(url,'/api/alert-display/ack',{viewer:'11111111-1111-4111-8111-111111111111',revision:msg.revision,applied:true});assert.equal((await p).ready,true);
 const q=post(url,'/api/alert-display/prepare',{}).then(r=>r.json());await a.next();assert.equal((await q).ready,false);
 assert.equal((await post(url,'/api/alert-display/prepare',{broadcastId:'old'})).status,409);
 }finally{a.controller.abort();other.controller.abort();s.closeAllConnections();await new Promise(r=>s.close(r));}
});
test('Native readiness requires matching captured event result; held is never marked applied',async()=>{
 const f=fixture(),{s,url}=await listen(f.app);try{const key='a'.repeat(64);f.capture={id:'c',status:'applied'};let res=await post(url,'/api/alert-display/prepare',{playbackKey:key});assert.equal((await res.json()).applied,true);
 f.capture={id:'c',status:'hold'};assert.equal((await (await post(url,'/api/alert-display/prepare',{playbackKey:key})).json()).applied,false);
 f.capture=null;assert.equal((await post(url,'/api/alert-display/prepare',{playbackKey:key})).status,409);
 assert.equal((await post(url,'/api/alert-display/prepare',{playbackKey:'bad'})).status,400);
 }finally{s.closeAllConnections();await new Promise(r=>s.close(r));}
});
test('Cross-origin native playback allowed only for exact configured origin and playback endpoints',async()=>{
 const old=process.env.NATIVE_TOONIE_ORIGIN;process.env.NATIVE_TOONIE_ORIGIN='https://native.example';const app=express();app.use(require('../operator-guard')({}));app.post('/api/donor-ranking/visibility',(q,r)=>r.json({ok:true}));app.post('/api/alert-display/prepare',(q,r)=>r.json({ok:true}));const {s,url}=await listen(app);
 try{const send=(path,origin)=>fetch(url+path,{method:'POST',headers:{Origin:origin}});assert.equal((await send('/api/donor-ranking/visibility','https://native.example')).status,200);assert.equal((await send('/api/alert-display/prepare','https://native.example')).status,200);assert.equal((await send('/api/donor-ranking/visibility','https://evil.example')).status,403);assert.equal((await send('/api/settings','https://native.example')).status,403);assert.equal((await send('/api/donor-ranking/visibility','http://native.example')).status,403);
 }finally{if(old===undefined)delete process.env.NATIVE_TOONIE_ORIGIN;else process.env.NATIVE_TOONIE_ORIGIN=old;s.closeAllConnections();await new Promise(r=>s.close(r));}
});
test('Collector commits automatic preset before receipt alert; native correlation survives capture',async()=>{
 let saved;const order=[],station={id:'s',slug:'s'},active={id:'b'},supabase={from(){return {insert(v){saved=v;return this},select(){return this},single:async()=>({data:{id:'c',...saved}})}}};
 const capture=require('../capture-test')({get(){},post(){}},{supabase,ensureActiveBroadcast:async()=>active,readEffectiveSettings:async()=>({broadcastLiveData:{live:true,status:'live',startedAt:'2026-10-25T00:00:00Z'}}),review:{prepare:async()=>({routing:{receiptFirst:true,state:'auto'},status:'pending',broadcast_id:'b'}),auto:async()=>{await new Promise(r=>setTimeout(r,30));order.push('commit')}},notify(){},afterReceive:async()=>order.push('alert')});
 const event={eventId:'e',donor:'후원자',amount:12000,receivedAt:'2026-10-25T01:00:00Z'};
 await capture.saveAccount(event,station);assert.deepEqual(order,['commit','alert']);
 // Native capture path uses authenticated route, so inspect it through its registered handler.
 const routes=new Map(),key='a'.repeat(64),token='x'.repeat(32),hash=require('node:crypto').createHash('sha256').update(token).digest('hex');
 const nativeDb={from(table){if(table==='station_collection_tokens')return {select(){return this},eq(){return this},maybeSingle:async()=>({data:{token_hash:hash}})};return supabase.from(table)}};
 require('../capture-test')({get(){},post(p,h){routes.set(p,h)}},{supabase:nativeDb,getStation:async()=>station,ensureActiveBroadcast:async()=>active,readEffectiveSettings:async()=>({broadcastLiveData:{live:true,status:'live',startedAt:'2026-10-25T00:00:00Z'}}),review:{prepare:async()=>({routing:{state:'auto'},status:'pending',broadcast_id:'b'}),auto:async()=>{}},notify(){}});
 const res={json(v){this.value=v;return this},status(v){this.code=v;return this}};await routes.get('/api/toonie-candidates')({headers:{'x-auto-donation-token':token},body:{...event,station:'s',playbackKey:key}},res);assert.equal(res.code,undefined);assert.equal(res.value.ok,true);assert.equal(saved.routing.playbackKey,key);
});
