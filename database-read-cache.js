'use strict';
const {AsyncLocalStorage}=require('node:async_hooks');
// Never cache accounts, passwords, tokens, sessions, device claims or queue RPCs.
// Server must use one replica; external DB writes expire within ttl milliseconds.
module.exports=function withReadCache(client,{ttl=15000,maxBytes=16*1024*1024}={}){
 const context=new AsyncLocalStorage(),entries=new Map(),pending=new Map();let epoch=0,bytes=0,writers=0;
 const tables=new Set(['settings','donations','donation_capture_candidates']);
 const safeRpc=new Set(['overlay_claim_job','overlay_touch_job','overlay_prune_jobs','overlay_prune_receipts','overlay_preset_current','claim_toonie_collector_stations']);
 function invalidate(){epoch++;entries.clear();pending.clear();bytes=0;}
 const clone=v=>structuredClone(v);
 async function read(key,run){if(!ttl||writers||context.getStore())return run();const hit=entries.get(key);if(hit&&hit.until>Date.now())return clone(hit.result);
  if(pending.has(key))return clone(await pending.get(key));const version=epoch;const task=Promise.resolve().then(run);pending.set(key,task);
  try{const r=await task;if(!r.error&&epoch===version&&!writers){const size=Buffer.byteLength(JSON.stringify(r));if(size<=maxBytes){const old=entries.get(key);if(old){bytes-=old.size;entries.delete(key);}while(entries.size&&(bytes+size>maxBytes||entries.size>=100)){const first=entries.keys().next().value;bytes-=entries.get(first).size;entries.delete(first);}entries.set(key,{result:clone(r),size,until:Date.now()+ttl});bytes+=size;}}return clone(r);}finally{if(pending.get(key)===task)pending.delete(key);}}
 async function write(run){writers++;invalidate();try{return await run();}finally{writers--;invalidate();}}
 function wrap(builder,table,chain=[],mutation=false){return new Proxy(builder,{get(target,key){
  if(key==='then')return (a,b)=>{const run=()=>Promise.resolve(target);const task=mutation?write(run):tables.has(table)?read(JSON.stringify([table,chain]),run):run();return task.then(a,b);};
  if(key==='catch')return b=>Promise.resolve(wrap(target,table,chain,mutation)).catch(b);
  const value=target[key];if(typeof value!=='function')return value;
  return (...args)=>wrap(value.apply(target,args),table,[...chain,[key,args]],mutation||['insert','update','upsert','delete'].includes(key));
 }});}
 return new Proxy(client,{get(target,key){
  if(key==='from')return table=>wrap(target.from(table),table);
  if(key==='rpc')return (name,args)=>safeRpc.has(name)?target.rpc(name,args):write(()=>target.rpc(name,args));
  if(key==='uncached')return fn=>context.run(true,async()=>await fn());
  if(key==='invalidateReads')return invalidate;
  const v=target[key];return typeof v==='function'?v.bind(target):v;
 }});
};
