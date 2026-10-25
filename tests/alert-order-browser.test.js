'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),express=require('express'),http=require('node:http'),path=require('node:path'),fs=require('node:fs'),{chromium}=require('playwright');
const bridgePath=process.env.NATIVE_BRIDGE_PATH||path.resolve(__dirname,'../../toonie-alert-order/src/main/resources/native-toonie-bridge.js');
async function start(app){const server=http.createServer(app);await new Promise(r=>server.listen(0,'127.0.0.1',r));return {server,url:'http://127.0.0.1:'+server.address().port};}
for(const expectedNet of [3,-2])test('Actual overlay renders preset '+expectedNet+' before account alert begins',async()=>{
 const app=express();app.use(express.json());let latest=0,jobSent=false,preparedAt=0,startedAt=0;const route=fn=>async(req,res)=>{try{await fn(req,res,{station:{id:'s',slug:'duugi'},active:{id:'b'}});}catch(e){res.status(400).json({error:e.message});}};
 require('../alert-display-sync')(app,{route,supabase:{},invalidate(){preparedAt=Date.now();latest=expectedNet;},ackTimeout:2000});
 const settings={title:'빵떠기',creators:['빵떠기'],presets:[{id:'smoke',title:'흡연',plusName:'흡연',minusName:'금연',enabled:true}],broadcastLiveData:{live:true,status:'live'},overlaySections:{creators:true,presets:true,allowance:true,account:true},allowanceData:{balance:0}};
 app.get('/api/overlay-state',async(req,res)=>{const value=latest;await new Promise(r=>setTimeout(r,120));res.json({settings,creators:[{creator:'빵떠기',total:30000,smoke:latest,presetNets:[{presetId:'smoke',plus:Math.max(0,value),minus:Math.max(0,-value)}]}],accountDonors:[],donations:[]});});
 app.get('/api/settings',(q,r)=>r.json(settings));app.get('/api/alert-config',(q,r)=>r.json({broadcastMode:'solo',targets:[{name:'빵떠기',active:true,group:'streamer'}],displayMode:'selected',selectedSections:['creators','presets','account'],deliveryMode:'dedicated'}));
 app.get('/api/donor-ranking/text-config',(q,r)=>r.json({enabled:false}));app.post('/api/donor-ranking/visibility',(q,r)=>r.json({ok:true,hidden:true,ready:true}));
 app.post('/api/alert-studio/next',(q,r)=>{if(jobSent)return r.json({inactive:true});jobSent=true;r.json({job:{id:'1',payload:{id:'event1',amount:6000,broadcastId:'b',donor:'테스트',source:'account',media:{}}},config:{deliveryMode:'dedicated',enabled:true}});});
 app.post('/api/alert-studio/touch',(q,r)=>{if(q.body.action==='start')startedAt=Date.now();r.json({ok:true});});app.use(express.static(path.resolve(__dirname,'../public')));
 const {server,url}=await start(app),browser=await chromium.launch({headless:true,args:['--no-sandbox']});const overlay=await browser.newPage(),player=await browser.newPage();
 try{await overlay.goto(url+'/overlay3.html?station=duugi&token=t&alerts=0');await overlay.waitForFunction(()=>typeof window.refreshOverlayBeforeAlert==='function');await overlay.waitForTimeout(300);
  await player.goto(url+'/sound-alert.html?station=duugi&token=t');await player.waitForFunction(()=>document.getElementById('status').textContent==='재생 중');assert.ok(startedAt>=preparedAt+100);assert.equal(await overlay.evaluate(()=>window.overlay3SyncReadOk),true);const preset=await overlay.locator('#allowanceRow').textContent();assert.ok(preset.includes(expectedNet>0?'+'+expectedNet:String(expectedNet)),preset);assert.equal(await player.locator('#alert').isVisible(),true);
 }finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
});
test('Native packet is released once after DB/display readiness; native VIP is not hidden',async()=>{
 const bridge=fs.readFileSync(bridgePath,'utf8'),app=express();app.use(express.json());let key='',prepareCalls=0;
 app.post('/api/alert-display/prepare',async(req,res)=>{prepareCalls++;key=req.body.playbackKey;await new Promise(r=>setTimeout(r,250));res.json({ok:true,ready:true,applied:true,status:'applied'});});
 require('../ranking-visibility')(app,{ctx:async()=>({station:{id:'s',slug:'duugi'},active:{id:'b'}}),notify(){}});
 app.get('/',(q,r)=>r.type('html').send(`<!doctype html><html><body><div id="app"><video class="vip-effect-intro"></video></div><script>
 window.nativeBridgeConfig={account:location.origin+'/sound-alert.html?station=duugi&token=t',proxy:'/proxy'};
 window.WebSocket=class extends EventTarget{constructor(url){super();this.url=url}emit(data){this.dispatchEvent(new MessageEvent('message',{data,origin:'https://toon.at'}))}};
 window.received=[];window.fixtureManager={CurrentAlert:null,FetchAlertData(){},scheduleManager:{},RemoteConf:{alert_pause:0}};document.getElementById('app').__vue__={manager:fixtureManager};
 </script><script>${bridge.replaceAll('</script>','<\\/script>')}</script><script>window.ws=new WebSocket('wss://ws.toon.at/test');ws.addEventListener('message',e=>{received.push({packet:JSON.parse(e.data),at:Date.now()});fixtureManager.CurrentAlert={Object:JSON.parse(e.data)};});</script></body></html>`));
 const {server,url}=await start(app),browser=await chromium.launch({headless:true,args:['--no-sandbox']}),page=await browser.newPage();
 try{await page.goto(url);await page.waitForTimeout(550);const packet={code:101,time:1792890000,content:{amount:12000,name:'빵디',message:'금연',title_info:{name:'후원'}}};
  await page.evaluate(p=>ws.emit(JSON.stringify(p)),packet);await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>received.length),0);assert.equal(await page.locator('#app').evaluate(e=>getComputedStyle(e).visibility),'visible');
  await page.waitForFunction(()=>received.length===1);assert.equal(prepareCalls,1);assert.match(key,/^[a-f0-9]{64}$/);assert.deepEqual(await page.evaluate(()=>received[0].packet),packet);
  const expected=require('node:crypto').createHash('sha256').update([String(packet.time),'빵디','12000','금연','후원'].map(v=>Buffer.from(v).toString('base64')).join('|')).digest('hex');assert.equal(key,expected);
  assert.equal((await (await fetch(url+'/api/donor-ranking/visibility')).json()).hidden,true);
  await page.evaluate(()=>fixtureManager.CurrentAlert=null);await page.waitForTimeout(450);assert.equal((await (await fetch(url+'/api/donor-ranking/visibility')).json()).hidden,false);
  assert.equal(await page.locator('#app').evaluate(e=>getComputedStyle(e).visibility),'visible');
 }finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
});
