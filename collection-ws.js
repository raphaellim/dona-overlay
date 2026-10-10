'use strict';
const {WebSocketServer,WebSocket}=require('ws');
const http=require('http');
// Same-origin WebSocket transport. API handlers retain their existing cookie/token authorization.
module.exports=function(server,{port}){
 const deploymentVersion=require('crypto').randomBytes(16).toString('hex');
 const wss=new WebSocketServer({noServer:true,maxPayload:65536,perMessageDeflate:false});
 server.on('upgrade',(req,socket,head)=>{if(req.url.split('?')[0]!=='/ws/collection')return;
  try{if(req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host){socket.destroy();return;}}catch{socket.destroy();return;}
  wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,req));});
 const send=(ws,b)=>{if(ws.readyState===WebSocket.OPEN&&ws.bufferedAmount<2e6)ws.send(JSON.stringify(b));};
 function invoke(req,path,method,body,headers={}){return new Promise((resolve,reject)=>{
  const bytes=body===undefined?'':JSON.stringify(body);
  const r=http.request({host:'127.0.0.1',port:typeof port==='function'?port():port,path,method,headers:{host:req.headers.host,cookie:req.headers.cookie||'',origin:req.headers.origin||'',...headers,'content-type':'application/json','content-length':Buffer.byteLength(bytes)}},res=>{let text='',size=0;res.on('data',chunk=>{size+=chunk.length;if(size>4e6){r.destroy(Error('응답 크기 초과'));return;}text+=chunk;});res.on('end',()=>resolve({status:res.statusCode,body:text,contentType:res.headers['content-type']}));});r.setTimeout(15000,()=>r.destroy(Error('서버 응답 지연')));r.on('error',reject);r.end(bytes);
 });}
 wss.on('connection',(ws,req)=>{
  ws.alive=true;ws.auth=null;ws.chain=Promise.resolve();let count=0,windowAt=Date.now(),queued=0;
  const deadline=setTimeout(()=>ws.close(1008,'authentication required'),10000);
  ws.on('pong',()=>ws.alive=true);ws.on('close',()=>clearTimeout(deadline));
  ws.on('message',raw=>{if(Date.now()-windowAt>10000){windowAt=Date.now();count=0;}if(++count>120||++queued>32){ws.close(1008,'rate limit');return;}
   ws.chain=ws.chain.then(async()=>{let m;try{m=JSON.parse(raw);if(!m||typeof m!=='object')throw Error('메시지 형식');
    if(m.type==='auth'){
     if(ws.auth)throw Error('이미 연결됨');
     if(m.kind==='web'){
       if(!req.headers.origin)throw Error('웹 Origin 필요');
       const station=String(m.station||'default'),authPath='/api/settings?station='+encodeURIComponent(station)+'&token='+encodeURIComponent(String(m.token||''));
       const access=await invoke(req,authPath,'GET');if(access.status!==200){send(ws,{type:'auth-error',code:access.status});ws.close(1008,'login required');return;}
       ws.auth={kind:'web',station};send(ws,{type:'ready',deploymentVersion});
     }else if(['device','toonie','account'].includes(m.kind)){
       const token=String(m.token||'');if(token.length<32||token.length>200)throw Error('연결 토큰 확인 필요');
       const state=await invoke(req,m.kind==='device'?'/api/bank-devices/sync':'/api/collection-ws-auth','POST',{station:m.station,source:m.kind},{[m.kind==='device'?'x-bank-device-token':'x-auto-donation-token']:token});
       if(state.status!==200){send(ws,{type:'auth-error',code:state.status,error:JSON.parse(state.body).error});ws.close(1008,'authentication failed');return;}
       const config=JSON.parse(state.body);ws.auth={kind:m.kind,token,station:config.station||m.station};send(ws,{type:'ready',config});
     }else throw Error('연결 종류 확인 필요');clearTimeout(deadline);return;
    }
    if(!ws.auth)throw Error('인증 필요');
    if(m.type==='rpc'&&ws.auth.kind==='web'){
      const path=String(m.path||''),method=String(m.method||'GET').toUpperCase();
      if(!/^\/api\/[A-Za-z0-9_/?=&%.:+-]+$/.test(path)||!['GET','POST','PUT','PATCH','DELETE'].includes(method)||/\/(?:auth|login|logout)|callback|pair$/.test(path))throw Error('지원하지 않는 요청');
      const h={};for(const key of ['x-station-slug','x-overlay-token','x-station-token','x-broadcast-password'])if(m.headers?.[key])h[key]=String(m.headers[key]).slice(0,300);
      const result=await invoke(req,path,method,m.body,h);send(ws,{type:'response',id:m.id,...result});return;
    }
    if(m.type==='status'&&ws.auth.kind==='device'){const result=await invoke(req,'/api/bank-devices/sync','POST',m.body||{},{'x-bank-device-token':ws.auth.token});const config=JSON.parse(result.body);send(ws,{type:result.status===200?'config':'auth-error',code:result.status,config,error:config.error});if(result.status!==200)ws.close(1008,'device revoked');return;}
    if(m.type==='event'&&ws.auth.kind!=='web'){
      const b=m.body||{};const a=ws.auth;if(a.station&&b.station!==a.station)throw Error('다른 방송국 내역');
      const result=await invoke(req,a.kind==='device'?'/api/bank-device-candidates':'/api/'+a.kind+'-candidates','POST',b,{[a.kind==='device'?'x-bank-device-token':'x-auto-donation-token']:a.token});
      send(ws,{type:'ack',eventId:b.eventId,code:result.status,...JSON.parse(result.body)});return;
    }throw Error('지원하지 않는 메시지');
   }catch(e){send(ws,{type:m?.type==='rpc'?'response':m?.type==='event'?'ack':'error',id:m?.id,eventId:m?.body?.eventId,status:400,code:400,ok:false,body:JSON.stringify({error:e.message}),error:e.message});}finally{queued--;}});
  });
 });
 const timer=setInterval(()=>{for(const ws of wss.clients){if(!ws.alive){ws.terminate();continue;}ws.alive=false;ws.ping();}},60000);timer.unref();server.on('close',()=>{clearInterval(timer);wss.close();});
 return {
  notify(station,type,payload){for(const ws of wss.clients)if(ws.auth?.kind==='web'&&ws.auth.station===station)send(ws,{type:'changed',topic:type,payload:type==='alert'?payload:undefined});},
  async devicesChanged(){for(const ws of wss.clients)if(ws.auth?.kind==='device'){try{const result=await invoke({headers:{host:'localhost'}},'/api/bank-devices/sync','POST',{}, {'x-bank-device-token':ws.auth.token});const config=JSON.parse(result.body);if(result.status===200){ws.auth.station=config.station;send(ws,{type:'config',config});}else{send(ws,{type:'auth-error',code:result.status,error:config.error});ws.close(1008,'device revoked');}}catch{}}}
 };
};
