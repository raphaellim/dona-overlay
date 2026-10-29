const {JSDOM,VirtualConsole}=require('jsdom');
const fs=require('node:fs'),assert=require('node:assert/strict');
const root=__dirname+'/../public/';
(async()=>{
 for(const preloaded of [true,false]){
  const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
  const dom=new JSDOM(fs.readFileSync(root+'app.html','utf8'),{url:'https://example.test/?station=sample',runScripts:'dangerously',virtualConsole:vc});
  const w=dom.window;w.document.getElementById('appMount').replaceChildren(w.document.getElementById('consoleTemplate').content.cloneNode(true));
  const user={role:'station_admin',name:'관리자',permissions:{}};
  if(preloaded)w.consoleInitialUser=user;
  w.fetch=async input=>({ok:true,text:async()=>JSON.stringify(String(input).includes('/api/operators')?{accounts:[]}:user)});
  for(const name of ['console-money.js','console-options.js','console-finance.js','mission-timer-model.js','mission-timer-clock.js','console-studio.js','console.js']){
   const script=w.document.createElement('script');script.textContent=fs.readFileSync(root+name,'utf8');w.document.body.append(script);
  }
  await new Promise(r=>setTimeout(r,30));
  assert.deepEqual(errors,[]);assert.equal(w.document.getElementById('error').textContent,'');
  assert.equal(w.document.getElementById('pageTitle').textContent,'운영 홈');assert.ok(w.document.querySelector('.home-grid .work-card'));
  const settings=w.document.querySelector('[data-tab="settings"]');settings.click();await new Promise(r=>setTimeout(r,30));
  assert.equal(w.document.getElementById('pageTitle').textContent,'연결·설정');assert.equal(w.document.getElementById('error').textContent,'');
  w.dispatchEvent(new w.Event('pagehide'));dom.window.close();
 }
 console.log('PASS console starts with preloaded login and fetched login, then navigates without initialization errors');
})().catch(e=>{console.error(e);process.exitCode=1});
