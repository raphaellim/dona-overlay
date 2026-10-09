const crypto=require('crypto');
function validWidgetUrl(value) {
  try {
    const u = new URL(String(value || '').trim());
    return u.protocol === 'https:' && u.hostname === 'toon.at' && /^\/widget\/alertbox\/[a-zA-Z0-9]+\/?$/.test(u.pathname)
      ? u.href : '';
  } catch { return ''; }
}


function parsePacket(payload){
 let event;try{event=JSON.parse(String(payload));}catch{return null;}
 const c=event?.content;if(!c||typeof c!=='object')return null;
 const donor=String(c.name||'익명의 후원자').trim()||'익명의 후원자',title=String(c.title_info?.name||'').trim(),amount=Number(c.amount),message=String(c.message||'');
 if(/테스트/i.test(donor+' '+title+' '+message)||!Number.isSafeInteger(amount)||amount<=0||amount>1e9)return null;
 return {donor,title,amount,message,replay:Number(event.replay||0)!==0};
}
function startToonieCollector({listSources,port,token}){
 const sources=new Map();let browser,syncing=false;
 if(!token){console.warn('Toonie collector disabled: AUTO_DONATION_TOKEN missing');return null;}
 const {chromium}=require('playwright');
 async function close(slug){const state=sources.get(slug);sources.delete(slug);if(state)await state.context.close().catch(()=>{});}
 async function open(slug,url){
 if(!browser||!browser.isConnected())browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const context=await browser.newContext(),page=await context.newPage();
 const state={context,url,status:'connecting',pending:[],sending:false};sources.set(slug,state);
 async function drain(){if(state.sending)return;state.sending=true;try{while(state.pending.length){const response=await fetch(`http://127.0.0.1:${port}/api/toonie-candidates`,{method:'POST',headers:{'content-type':'application/json','x-auto-donation-token':token},body:JSON.stringify(state.pending[0]),signal:AbortSignal.timeout(10000)});if(!response.ok){console.warn('Toonie queue save failed',slug,response.status);break;}state.pending.shift();}}catch(e){console.warn('Toonie queue save failed',slug,e.message);}finally{state.sending=false;}}
 state.drain=drain;
 page.on('websocket',ws=>{
 if(!/^wss:\/\/(?:ws\.toon\.at|toon\.at)(?::\d+)?\//.test(ws.url()))return;
 state.status='connected';ws.on('close',()=>{state.status='disconnected';});ws.on('socketerror',()=>{state.status='disconnected';});
 ws.on('framereceived',frame=>{const parsed=parsePacket(frame.payload);if(!parsed)return;state.pending.push({...parsed,station:slug,eventId:'widget:'+crypto.randomUUID(),receivedAt:new Date().toISOString()});drain();});
 });
 try{await page.goto(url,{waitUntil:'domcontentloaded',timeout:30000});}catch(e){await close(slug);throw e;}
 }
 async function sync(){if(syncing)return;syncing=true;try{
 const wanted=new Map((await listSources()).map(x=>[x.slug,validWidgetUrl(x.url)]).filter(x=>x[1]));
 for(const [slug,state]of sources){await state.drain();if(wanted.get(slug)!==state.url||state.status==='disconnected')await close(slug);}
 for(const [slug,url]of wanted)if(!sources.has(slug)){try{await open(slug,url);}catch(e){console.warn('Toonie widget connect failed',slug,e.message);}}
 }catch(e){console.warn('Toonie sync failed',e.message);}finally{syncing=false;}}
 setTimeout(sync,3000);setInterval(sync,15000);
 return {sync,status:slug=>sources.get(slug)?.status||'disconnected'};
}
module.exports={validWidgetUrl,parsePacket,startToonieCollector};
