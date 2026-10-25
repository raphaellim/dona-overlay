(()=>{'use strict';if(new URLSearchParams(location.search).get('demo')==='1')return;
 const q=new URLSearchParams(location.search),viewer=crypto.randomUUID(),params=new URLSearchParams({station:q.get('station')||'default',token:q.get('token')||'',viewer}),raw=window.overlayDisplayNativeFetch||window.fetch.bind(window);let disposed=false,tail=Promise.resolve();const controllers=new Set(),frames=new Set();
 const painted=()=>document.hidden?Promise.resolve():new Promise(resolve=>{let done=false;const finish=()=>{if(done)return;done=true;clearTimeout(timer);frames.delete(finish);resolve();};const timer=setTimeout(finish,100);frames.add(finish);requestAnimationFrame(()=>requestAnimationFrame(finish));});
 const stream=new EventSource('/api/alert-display/stream?'+params);
 stream.onmessage=e=>{let b;try{b=JSON.parse(e.data);}catch{return;}if(disposed||b.type!=='apply'||!b.revision)return;
  tail=tail.catch(()=>{}).then(async()=>{if(disposed)return;if(typeof window.refreshOverlayBeforeAlert!=='function')throw Error('오버레이 동기화 연결 필요');await window.refreshOverlayBeforeAlert();await painted();if(disposed)return;const c=new AbortController(),timer=setTimeout(()=>c.abort(),2000);controllers.add(c);try{await raw('/api/alert-display/ack?'+params,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({viewer,revision:b.revision,applied:true}),signal:c.signal,keepalive:true});}finally{clearTimeout(timer);controllers.delete(c);}}).catch(()=>console.warn('[overlay display] refresh acknowledgement failed'));
 };
 window.addEventListener('pagehide',()=>{disposed=true;stream.close();for(const c of controllers)c.abort();for(const finish of frames)finish();frames.clear();},{once:true});
})();
