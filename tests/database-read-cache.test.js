'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const cache=require('../database-read-cache');
function fake(){let reads=0,root={value:1},writes=0;return {get reads(){return reads},get writes(){return writes},from(table){let writing=false,value;const b={select(){return b},eq(){return b},maybeSingle(){return b},upsert(v){writing=true;value=v;return b},then(ok,bad){return Promise.resolve().then(()=>{if(writing){writes++;root=value;return {error:null,data:null}}reads++;return {error:null,data:structuredClone(root)}}).then(ok,bad)}};return b},async rpc(){root={value:5};return {error:null,data:true}}};}
test('Repeated bulk reads coalesce, clone, invalidate after write and RPC; auth always fresh',async()=>{
 const raw=fake(),c=cache(raw);const get=()=>c.from('settings').select('data').eq('id',1).maybeSingle();
 const results=await Promise.all(Array.from({length:20},get));assert.equal(raw.reads,1);results[0].data.value=99;assert.equal((await get()).data.value,1);
 for(let i=0;i<100;i++)await get();assert.equal(raw.reads,1);
 await c.from('settings').upsert({value:2});assert.equal((await get()).data.value,2);
 await c.rpc('overlay_insert_donations',{});assert.equal((await get()).data.value,5);
 const n=raw.reads;await c.uncached(()=>get());await c.uncached(()=>get());assert.equal(raw.reads,n+2);
 await c.from('operator_sessions').select();await c.from('operator_sessions').select();assert.equal(raw.reads,n+4);
});
test('Failed reads are not cached; TTL expires; disabled cache reads every time',async()=>{
 let calls=0;const raw={from(){return {select(){return this},then(ok){calls++;return Promise.resolve({data:calls===1?null:[],error:calls===1?{message:'offline'}:null}).then(ok)}}}};
 const c=cache(raw,{ttl:5});await c.from('settings').select();await c.from('settings').select();assert.equal(calls,2);await c.from('settings').select();assert.equal(calls,2);await new Promise(r=>setTimeout(r,10));await c.from('settings').select();assert.equal(calls,3);
 const d=cache(raw,{ttl:0});await d.from('settings').select();await d.from('settings').select();assert.equal(calls,5);
});
test('An in-flight read started before mutation cannot repopulate cache',async()=>{
 let release,reads=0;const raw={from(){let write=false;return {select(){return this},update(){write=true;return this},then(ok){if(write)return Promise.resolve({data:null,error:null}).then(ok);reads++;return (reads===1?new Promise(r=>release=r):Promise.resolve({data:{v:2},error:null})).then(ok)}}}};
 const c=cache(raw),first=Promise.resolve(c.from('settings').select());await new Promise(r=>setImmediate(r));await c.from('settings').update({});release({data:{v:1},error:null});await first;assert.equal((await c.from('settings').select()).data.v,2);assert.equal(reads,2);
});
