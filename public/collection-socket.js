(()=>{'use strict';
 const nativeFetch=window.fetch.bind(window),params=new URLSearchParams(location.search),station=params.get('station')||localStorage.getItem('STATION_SLUG')||'default';
 if(params.get('demo')==='1')return;
 // Configuration subpages reuse their parent's authenticated connection.
 try{const hub=parent!==window&&parent.location.origin===location.origin&&params.get('embedded')==='1'&&!params.has('token')?parent.collectionBridge:null;if(hub&&hub.station===station){
  const forward=name=>e=>window.dispatchEvent(new CustomEvent(name,{detail:e.detail?structuredClone(e.detail):undefined}));const names=['collection:changed','collection:connected','collection:disconnected'],handlers=names.map(forward);names.forEach((n,i)=>parent.addEventListener(n,handlers[i]));window.collectionIO=()=>hub.makeIO();window.fetch=(input,options={})=>{let u;try{u=new URL(typeof input==='string'?input:input.url,location.href);}catch{return nativeFetch(input,options);}return u.origin===location.origin&&u.pathname.startsWith('/api/')?hub.fetch(input,options):nativeFetch(input,options);};if(hub.connected)queueMicrotask(()=>window.dispatchEvent(new Event('collection:connected')));let cleaned=false;const cleanup=()=>{if(cleaned)return;cleaned=true;names.forEach((n,i)=>parent.removeEventListener(n,handlers[i]));window.fetch=nativeFetch;};window.addEventListener('pagehide',cleanup,{once:true});window.addEventListener('unload',cleanup,{once:true});return;}}catch{}

 let disposed=false,socket,ready=false,retry=1000,seq=0,connectPromise,resolveConnect,rejectConnect,timer,connectTimeout;
 const pending=new Map();
 const inflightReads=new Map(),readStats={sent:0,shared:0};window.collectionReadStats=readStats;
 const sharedReadPaths=new Set(['/api/overlay-state','/api/summary','/api/settings','/api/station-info','/api/alert-config','/api/alert-studio/config','/api/overlay-link-token','/api/station/collection-rules','/api/donor-ranking/config']);
 function readOnce(input,options,url){
  if(options.signal||(input&&typeof input.url==='string'&&typeof input.clone==='function')||!sharedReadPaths.has(url.pathname))return nativeFetch(input,options);
  const key=JSON.stringify([url.href,options.credentials||'same-origin',[...new Headers(options.headers||{}).entries()]]);
  let task=inflightReads.get(key);if(task){readStats.shared++;return task.then(r=>r.clone());}
  readStats.sent++;task=nativeFetch(input,options);inflightReads.set(key,task);
  const clear=()=>{if(inflightReads.get(key)===task)inflightReads.delete(key);};task.then(clear,clear);
  return task.then(r=>r.clone());
 }

 const autoUpdate=/\/(?:overlay[^/]*|summary[^/]*|donation-alert|sound-alert)\.html$/i.test(location.pathname);
 let loadedDeployment=null;
 function checkDeployment(version){
  if(!autoUpdate||!version)return false;
  const key='overlay-deployment:'+location.origin+location.pathname;
  let previous=loadedDeployment;try{previous=previous||sessionStorage.getItem(key);sessionStorage.setItem(key,version);}catch{}
  loadedDeployment=version;
  if(previous&&previous!==version){const url=new URL(location.href);url.searchParams.set('v',version);location.replace(url.href);return true;}
  return false;
 }

 function connect(){if(disposed)return;if(socket&&(socket.readyState===0||socket.readyState===1))return;
  connectPromise=new Promise((resolve,reject)=>{resolveConnect=resolve;rejectConnect=reject;});connectPromise.catch(()=>{});
  socket=new WebSocket((location.protocol==='https:'?'wss:':'ws:')+'//'+location.host+'/ws/collection');
  const timeout=connectTimeout=setTimeout(()=>{rejectConnect(Error('웹소켓 연결 지연'));socket.close();},15000);
  socket.onopen=()=>socket.send(JSON.stringify({type:'auth',kind:'web',station,token:params.get('token')||''}));
  socket.onmessage=e=>{let m;try{m=JSON.parse(e.data);}catch{return;}
   if(m.type==='ready'){clearTimeout(timeout);if(checkDeployment(m.deploymentVersion))return;ready=true;retry=1000;resolveConnect();window.dispatchEvent(new CustomEvent('collection:connected'));}
   if(m.type==='response'){const p=pending.get(m.id);if(p){clearTimeout(p.timeout);pending.delete(m.id);p.resolve(new Response(m.body||'',{status:m.status||500,headers:{'content-type':m.contentType||'application/json'}}));}}
   if(m.type==='changed')window.dispatchEvent(new CustomEvent('collection:changed',{detail:m}));
  };
  socket.onclose=()=>{clearTimeout(timeout);ready=false;rejectConnect(Error('웹소켓 연결 끊김'));for(const p of pending.values()){clearTimeout(p.timeout);p.reject(Error('연결 끊김 · 저장 결과를 다시 확인하세요'));}pending.clear();window.dispatchEvent(new CustomEvent('collection:disconnected'));clearTimeout(timer);if(!disposed)timer=setTimeout(connect,retry+Math.random()*500);retry=Math.min(retry*2,60000);};
 }
 // Adapt existing overlay event listeners to this same connection; no second socket.
 window.collectionIO=()=>{
  const handlers=new Map();
  const fire=(name,value)=>{for(const fn of handlers.get(name)||[])fn(value);};
  const connected=()=>fire('connect'),disconnected=()=>fire('disconnect');
  const changed=e=>{const topic=e.detail.topic;if(['candidates','rules','alert','preset','alertWake','alertList','overlayPatch','timer','allowance','funding','stack','studioStyle','karaoke','alertControl','playback'].includes(topic))return;fire('overlay:changed',{type:topic||'state'});};
  window.addEventListener('collection:connected',connected);window.addEventListener('collection:disconnected',disconnected);window.addEventListener('collection:changed',changed);
  return {on(name,fn){if(!handlers.has(name))handlers.set(name,[]);handlers.get(name).push(fn);if(name==='connect'&&ready)queueMicrotask(fn);return this;},emit(name,payload,ack){if(name==='station:join'&&typeof ack==='function')ack({ok:true,station});},disconnect(){window.removeEventListener('collection:connected',connected);window.removeEventListener('collection:disconnected',disconnected);window.removeEventListener('collection:changed',changed);handlers.clear();}};
 };
 connect();
 window.addEventListener('pagehide',()=>{disposed=true;ready=false;inflightReads.clear();clearTimeout(timer);clearTimeout(connectTimeout);if(socket){socket.onclose=null;socket.onmessage=null;socket.onerror=null;socket.close();}for(const p of pending.values()){clearTimeout(p.timeout);p.reject(Error('페이지 종료'));}pending.clear();},{once:true});
 window.fetch=async(input,options={})=>{
  const request=(input&&typeof input.url==='string'&&typeof input.clone==='function')?input:null,url=new URL(request?request.url:String(input),location.href);
  if(url.origin!==location.origin||!url.pathname.startsWith('/api/')||/\/auth|\/login|\/logout|callback|\/media|\/upload/.test(url.pathname)||options.body instanceof FormData||options.body instanceof Blob)return nativeFetch(input,options);
  const method=(options.method||request?.method||'GET').toUpperCase(),headers=Object.fromEntries(new Headers(options.headers||request?.headers||{}));
  // Console reads use authenticated same-origin HTTP, independent of the serialized RPC write queue.
  if(method==='GET')return readOnce(input,options,url);
  inflightReads.clear();
  if(!ready){connect();await connectPromise;}
  let body=options.body;if(body===undefined&&request&&!['GET','HEAD'].includes(method))body=await request.clone().text();
  if(body){try{body=JSON.parse(body);}catch{return nativeFetch(input,options);}}
  const id=String(++seq);return new Promise((resolve,reject)=>{const timeout=setTimeout(()=>{pending.delete(id);reject(Error('서버 응답 지연 · 저장 결과 확인 필요'));},20000);pending.set(id,{resolve,reject,timeout});socket.send(JSON.stringify({type:'rpc',id,path:url.pathname+url.search,method,headers,body}));});
 };
window.collectionBridge={station,get connected(){return ready;},fetch:(...args)=>window.fetch(...args),makeIO:()=>window.collectionIO()};
})();
