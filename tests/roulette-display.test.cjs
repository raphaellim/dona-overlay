const {JSDOM,VirtualConsole}=require('jsdom'),fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
 const dom=new JSDOM('<body></body>',{url:'https://example.test/overlay3.html?station=sample&token=test',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc}),w=dom.window;
 let current=null,reads=0;
 w.Audio=class{constructor(){this.volume=1;}play(){return Promise.resolve();}pause(){}addEventListener(){}removeEventListener(){}};
 w.fetch=async input=>{reads++;const url=new URL(input,w.location.href);assert.equal(url.searchParams.get('station'),'sample');assert.equal(url.searchParams.get('token'),'test');return {ok:true,json:async()=>({roulette:{current,lists:[{id:'list',items:[{text:'당첨',enabled:true}]}]}})};};
 w.eval(fs.readFileSync(__dirname+'/../public/assets/js/roulette-overlay.js','utf8'));
 await new Promise(r=>setTimeout(r,30));assert.equal(reads,1);assert.ok(w.document.getElementById('rouletteOverlayRoot'));assert.equal(w.document.querySelector('.roulette-overlay-root.show'),null);
 current={runId:'run-1',running:true,result:'당첨',listId:'list',duration:60000,donor:'테스트'};
 w.dispatchEvent(new w.CustomEvent('collection:changed',{detail:{topic:'roulette'}}));
 await new Promise(r=>setTimeout(r,30));assert.equal(reads,2);assert.ok(w.document.querySelector('.roulette-overlay-root.show.spinning'));assert.ok(w.document.getElementById('rouletteOverlayName').textContent);assert.deepEqual(errors,[]);
 w.dispatchEvent(new w.Event('pagehide'));w.dispatchEvent(new w.CustomEvent('collection:changed',{detail:{topic:'roulette'}}));await new Promise(r=>setTimeout(r,10));assert.equal(reads,2);
 dom.window.close();console.log('PASS roulette realtime start displays overlay DOM with station/token and detaches on exit');
})().catch(e=>{console.error(e);process.exitCode=1});
