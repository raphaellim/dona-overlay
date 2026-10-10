(()=>{'use strict';
 const nativeFetch=window.fetch.bind(window),params=new URLSearchParams(location.search),station=params.get('station')||localStorage.getItem('STATION_SLUG')||'default';
 if(params.get('demo')==='1')return;
 let socket,ready=false,retry=1000,seq=0,connectPromise,resolveConnect,rejectConnect,timer;
 const pending=new Map();
 function connect(){if(socket&&(socket.readyState===0||socket.readyState===1))return;
  connectPromise=new Promise((resolve,reject)=>{resolveConnect=resolve;rejectConnect=reject;});connectPromise.catch(()=>{});
  socket=new WebSocket((location.protocol==='https:'?'wss:':'ws:')+'//'+location.host+'/ws/collection');
  const timeout=setTimeout(()=>{rejectConnect(Error('웹소켓 연결 지연'));socket.close();},15000);
  socket.onopen=()=>socket.send(JSON.stringify({type:'auth',kind:'web',station,token:params.get('token')||''}));
  socket.onmessage=e=>{let m;try{m=JSON.parse(e.data);}catch{return;}
   if(m.type==='ready'){clearTimeout(timeout);ready=true;retry=1000;resolveConnect();window.dispatchEvent(new CustomEvent('collection:connected'));}
   if(m.type==='response'){const p=pending.get(m.id);if(p){clearTimeout(p.timeout);pending.delete(m.id);p.resolve(new Response(m.body||'',{status:m.status||500,headers:{'content-type':m.contentType||'application/json'}}));}}
   if(m.type==='changed')window.dispatchEvent(new CustomEvent('collection:changed',{detail:m}));
  };
  socket.onclose=()=>{clearTimeout(timeout);ready=false;rejectConnect(Error('웹소켓 연결 끊김'));for(const p of pending.values()){clearTimeout(p.timeout);p.reject(Error('연결 끊김 · 저장 결과를 다시 확인하세요'));}pending.clear();window.dispatchEvent(new CustomEvent('collection:disconnected'));clearTimeout(timer);timer=setTimeout(connect,retry+Math.random()*500);retry=Math.min(retry*2,60000);};
 }
 // Adapt existing overlay event listeners to this same connection; no second socket.
 window.collectionIO=()=>{
  const handlers=new Map();
  const fire=(name,value)=>{for(const fn of handlers.get(name)||[])fn(value);};
  const connected=()=>fire('connect'),disconnected=()=>fire('disconnect');
  const changed=e=>{const topic=e.detail.topic;if(['candidates','rules','alert'].includes(topic))return;fire('overlay:changed',{type:topic||'state'});};
  window.addEventListener('collection:connected',connected);window.addEventListener('collection:disconnected',disconnected);window.addEventListener('collection:changed',changed);
  return {on(name,fn){if(!handlers.has(name))handlers.set(name,[]);handlers.get(name).push(fn);if(name==='connect'&&ready)queueMicrotask(fn);return this;},emit(name,payload,ack){if(name==='station:join'&&typeof ack==='function')ack({ok:true,station});},disconnect(){window.removeEventListener('collection:connected',connected);window.removeEventListener('collection:disconnected',disconnected);window.removeEventListener('collection:changed',changed);handlers.clear();}};
 };
 connect();
 window.fetch=async(input,options={})=>{
  const request=input instanceof Request?input:null,url=new URL(request?request.url:String(input),location.href);
  if(url.origin!==location.origin||!url.pathname.startsWith('/api/')||/\/auth|\/login|\/logout|callback|\/media|\/upload/.test(url.pathname)||options.body instanceof FormData||options.body instanceof Blob)return nativeFetch(input,options);
  if(!ready){connect();await connectPromise;}
  const method=(options.method||request?.method||'GET').toUpperCase(),headers=Object.fromEntries(new Headers(options.headers||request?.headers||{}));
  let body=options.body;if(body===undefined&&request&&!['GET','HEAD'].includes(method))body=await request.clone().text();
  if(body){try{body=JSON.parse(body);}catch{return nativeFetch(input,options);}}
  const id=String(++seq);return new Promise((resolve,reject)=>{const timeout=setTimeout(()=>{pending.delete(id);reject(Error('서버 응답 지연 · 저장 결과 확인 필요'));},20000);pending.set(id,{resolve,reject,timeout});socket.send(JSON.stringify({type:'rpc',id,path:url.pathname+url.search,method,headers,body}));});
 };
})();
