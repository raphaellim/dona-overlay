/* v6.16.5: share concurrent reads, without retaining completed responses. */
(()=>{'use strict';const original=window.fetch.bind(window),pending=new Map();
window.fetch=function(input,options){
 let url;try{url=new URL(typeof input==='string'||input instanceof URL?input:input.url,location.href);}catch{return original(input,options);}
 const method=String(options?.method||input?.method||'GET').toUpperCase();
 if(method!=='GET'||url.origin!==location.origin||!['/api/overlay-state','/api/alert-config','/api/settings'].includes(url.pathname))return original(input,options);
 // Keep authentication/station/broadcast values; ignore only UI flags and cache busters.
 for(const flag of ["_","mute","status","monitor","bg","debug","alerts"])url.searchParams.delete(flag);
 url.searchParams.sort();const key=url.href;
 if(!pending.has(key)){
  const request=original(input,options).then(async response=>({response,bytes:await response.arrayBuffer()}));
  pending.set(key,request);request.finally(()=>{if(pending.get(key)===request)pending.delete(key);}).catch(()=>{});
 }
 return pending.get(key).then(({response,bytes})=>new Response(bytes.slice(0),{status:response.status,statusText:response.statusText,headers:response.headers}));
};})();
