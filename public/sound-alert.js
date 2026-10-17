(()=>{'use strict';const q=new URLSearchParams(location.search),monitor=q.get('monitor')==='1',owner='player:'+crypto.randomUUID(),$=id=>document.getElementById(id);let busy=false,disposed=false,again=false,session=null,idleTimer=null;const rawFetch=window.soundAlertNativeFetch||window.fetch.bind(window);
if(q.get('status')==='1')$('status').style.display='block';const status=s=>{if($('status').textContent!==s)$('status').textContent=s;};
async function api(path,body,signal){const controller=new AbortController(),abort=()=>controller.abort();if(signal?.aborted)abort();signal?.addEventListener('abort',abort,{once:true});const timeout=setTimeout(abort,10000);try{const r=await rawFetch(path+'?'+q,{method:body?'POST':'GET',headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:controller.signal});const data=await r.json();if(!r.ok)throw Error(data.error||'알림 서버 오류');return data;}finally{clearTimeout(timeout);signal?.removeEventListener('abort',abort);}}

function delay(ms,signal){return new Promise((resolve,reject)=>{if(signal.aborted)return reject(Error('취소됨'));const onAbort=()=>{clearTimeout(t);reject(Error('취소됨'));};const t=setTimeout(()=>{signal.removeEventListener('abort',onAbort);resolve();},ms);signal.addEventListener('abort',onAbort,{once:true});});}
function eventReady(target,event,signal,timeout=15000){return new Promise((resolve,reject)=>{const clean=()=>{clearTimeout(t);target.removeEventListener(event,ok);target.removeEventListener('error',bad);signal.removeEventListener('abort',bad);};const ok=()=>{clean();resolve();},bad=()=>{clean();reject(Error('미디어 로딩 실패/취소'));},t=setTimeout(bad,timeout);target.addEventListener(event,ok,{once:true});target.addEventListener('error',bad,{once:true});signal.addEventListener('abort',bad,{once:true});if(signal.aborted)bad();});}
function clearMedia(){if(!session)return;session.controller.abort();clearInterval(session.heartbeat);clearTimeout(session.limit);if(session.audio){session.audio.pause();session.audio.removeAttribute('src');session.audio.load();session.audio=null;}$('image').removeAttribute('src');$('image').hidden=true;$('alert').hidden=true;$('title').textContent='';$('comment').textContent='';$('unlock').hidden=true;$('unlock').onclick=null;session=null;}
async function touch(job,action){const r=await api('/api/alert-studio/touch',{id:job.id,owner,action});if(!r.ok)throw Error('재생 권한이 만료되었습니다');}
async function play(job,config={}){const controller=new AbortController();session={controller,audio:null,heartbeat:null,limit:null};const signal=controller.signal,p=job.payload,media=p.media||{};let success=false;
try{
 session.limit=setTimeout(()=>controller.abort(),210000);
 session.heartbeat=setInterval(()=>touch(job,'heartbeat').catch(()=>controller.abort()),15000);
 let audio;
 const ready=[];
 if(media.image){$('image').hidden=false;ready.push(eventReady($('image'),'load',signal));$('image').src=media.image;}
 if(media.sound){audio=new Audio();session.audio=audio;audio.preload='auto';ready.push(eventReady(audio,'canplay',signal));audio.src=media.sound;audio.load();}
 status('알림 미디어 준비 중');await Promise.all(ready);if(signal.aborted)throw Error('취소됨');
 if(media.image&&($('image').naturalWidth>4096||$('image').naturalHeight>4096))throw Error('이미지는 가로·세로 4096px 이하를 사용하세요');
 if(audio&&(!Number.isFinite(audio.duration)||audio.duration>180))throw Error('음원은 180초 이내 파일을 사용하세요');
 await touch(job,'start');
 $('text').hidden=media.showText===false;
 if(p.kind==='preset'){$('title').textContent=p.donor+' · '+p.preset+' '+(p.delta>0?'+':'')+p.delta;$('comment').textContent=p.creator+' · 현재 '+(p.current>0?'+':'')+p.current;$('text').style.background=p.delta<0?'#693329':'#104e3d';}
 else{$('title').textContent=p.donor+' · '+Number(p.amount||0).toLocaleString('ko-KR');$('comment').textContent=p.message||'';$('text').style.background='rgba(16,35,31,'+Math.max(0,Math.min(100,Number(config.alertOpacity??94)))/100+')';}
 $('alert').hidden=false;status('재생 중');
 if(p.kind==='preset'){await delay(3000,signal);}else{
 await delay(1000,signal);
 if(audio){const ended=eventReady(audio,'ended',signal,185000);ended.catch(()=>{});let stallTimer=null;const stalled=()=>{clearTimeout(stallTimer);stallTimer=setTimeout(()=>controller.abort(),10000);};const resumed=()=>clearTimeout(stallTimer);audio.addEventListener('waiting',stalled);audio.addEventListener('playing',resumed);
 try{try{await audio.play();}catch(e){if(e.name!=='NotAllowedError')throw e;$('unlock').hidden=false;status('브라우저 소리 허용 필요');await new Promise((resolve,reject)=>{const t=setTimeout(()=>{signal.removeEventListener('abort',cancel);reject(Error('소리 허용 시간 초과'));},30000),cancel=()=>{clearTimeout(t);reject(Error('취소됨'));};signal.addEventListener('abort',cancel,{once:true});$('unlock').onclick=()=>audio.play().then(()=>{clearTimeout(t);signal.removeEventListener('abort',cancel);$('unlock').hidden=true;resolve();}).catch(()=>{});});}await ended;}finally{clearTimeout(stallTimer);audio.removeEventListener('waiting',stalled);audio.removeEventListener('playing',resumed);}
 }else await delay(3000,signal);
 await delay(1000,signal);
 }
 success=true;
}catch(e){status(e.message);console.warn('[sound alert]',e.message);}finally{clearMedia();try{await touch(job,success?'done':'failed');}catch(e){status(e.message);}}
}
async function pump(){if(monitor){$('status').style.display='block';status('모니터 모드 · OBS/PRISM 소스에서 재생됩니다');return;}if(disposed)return;if(busy){again=true;return;}busy=true;clearTimeout(idleTimer);try{do{again=false;const d=await api('/api/alert-studio/next',{owner});if(d.inactive){status('독립 알림 모드를 켜세요');break;}if(!d.job){if(again&&!d.busy)continue;status(d.busy?'다른 소스가 재생 담당 중':'연결됨 · 대기');break;}await play(d.job,d.config);if(disposed)break;again=true;}while(again);}catch(e){status(e.message);}finally{busy=false;if(!disposed)idleTimer=setTimeout(pump,60000);}}
window.addEventListener('collection:changed',e=>{if(['alertWake','preset'].includes(e.detail.topic))pump();if(e.detail.topic==='playback'){api('/api/alert-studio/config').then(c=>{if(c.deliveryMode!=='dedicated'||!c.enabled){clearMedia();}else pump();}).catch(()=>{});}});window.addEventListener('collection:connected',pump);window.addEventListener('pagehide',()=>{disposed=true;clearTimeout(idleTimer);clearMedia();},{once:true});pump();})();
