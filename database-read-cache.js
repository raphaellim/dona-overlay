'use strict';
const {AsyncLocalStorage}=require('node:async_hooks');
// Never cache accounts, passwords, tokens, sessions, device claims or queue RPCs.
// Server must use one replica; external DB writes expire within ttl milliseconds.
module.exports=function withReadCache(client,{ttl=15000,maxBytes=16*1024*1024}={}){
 const context=new AsyncLocalStorage(),entries=new Map(),pending=new Map();let bytes=0;
 const tables=new Set(['settings','donations','donation_capture_candidates']);
 const epochs=new Map([...tables].map(t=>[t,0])),writers=new Map([...tables].map(t=>[t,0]));
 const safeRpc=new Set(['overlay_claim_job','overlay_touch_job','overlay_prune_jobs','overlay_prune_receipts','overlay_preset_current','claim_toonie_collector_stations']);
 function invalidate(affected=tables){const set=new Set(affected);for(const t of set)epochs.set(t,(epochs.get(t)||0)+1);
  for(const [key,e]of entries)if(set.has(e.table)){entries.delete(key);bytes-=e.size;}
  for(const [key,p]of pending)if(set.has(p.table))pending.delete(key);
 }
 const clone=v=>structuredClone(v);
 async function read(table,key,run){if(!ttl||writers.get(table)||context.getStore())return run();const hit=entries.get(key);if(hit&&hit.until>Date.now())return clone(hit.result);
  if(pending.has(key))return clone(await pending.get(key).task);const version=epochs.get(table);const task=Promise.resolve().then(run);pending.set(key,{table,task});
  try{const r=await task;if(!r.error&&epochs.get(table)===version&&!writers.get(table)){const size=Buffer.byteLength(JSON.stringify(r));if(size<=maxBytes){const old=entries.get(key);if(old){bytes-=old.size;entries.delete(key);}while(entries.size&&(bytes+size>maxBytes||entries.size>=100)){const first=entries.keys().next().value;bytes-=entries.get(first).size;entries.delete(first);}entries.set(key,{table,result:clone(r),size,until:Date.now()+ttl});bytes+=size;}}return clone(r);}finally{if(pending.get(key)?.task===task)pending.delete(key);}}
 async function write(affected,run){for(const t of affected)writers.set(t,(writers.get(t)||0)+1);invalidate(affected);try{return await run();}finally{for(const t of affected)writers.set(t,writers.get(t)-1);invalidate(affected);}}
 function wrap(builder,table,chain=[],mutation=false){return new Proxy(builder,{get(target,key){
  if(key==='then')return (a,b)=>{const run=()=>Promise.resolve(target);const task=mutation?(tables.has(table)?write([table],run):run()):tables.has(table)?read(table,JSON.stringify([table,chain]),run):run();return task.then(a,b);};
  if(key==='catch')return b=>Promise.resolve(wrap(target,table,chain,mutation)).catch(b);
  const value=target[key];if(typeof value!=='function')return value;
  return (...args)=>wrap(value.apply(target,args),table,[...chain,[key,args]],mutation||['insert','update','upsert','delete'].includes(key));
 }});}
 return new Proxy(client,{get(target,key){
  if(key==='from')return table=>wrap(target.from(table),table);
  if(key==='readSettingsScope'&&typeof target.readSettingsScope==='function')return (station,broadcast)=>read('settings',JSON.stringify(['settings-scope',station,broadcast??null]),()=>target.readSettingsScope(station,broadcast));
  // Unknown functions may change funding/settings and donations atomically.
  if(key==='rpc')return (name,args)=>safeRpc.has(name)?target.rpc(name,args):write([...tables],()=>target.rpc(name,args));
  if(key==='uncached')return fn=>context.run(true,async()=>await fn());
  if(key==='invalidateReads')return affected=>invalidate(affected);
  const v=target[key];return typeof v==='function'?v.bind(target):v;
 }});
};
