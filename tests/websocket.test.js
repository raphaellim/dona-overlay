const assert=require('node:assert/strict'),http=require('node:http'),express=require('express'),{WebSocket}=require('ws');
const mount=require('../collection-ws');
(async()=>{const app=express();app.use(express.json());let events=0,linked=false;const token='a'.repeat(64);
app.get('/api/settings',(req,res)=>res.status(req.headers.cookie==='session=ok'?200:403).json({ok:true}));
app.get('/api/test',(req,res)=>res.json({cookie:req.headers.cookie,station:req.query.station}));
app.post('/api/collection-ws-auth',(req,res)=>res.status(req.headers['x-auto-donation-token']===token?200:401).json({station:'duugi'}));
app.post('/api/toonie-candidates',(req,res)=>{events++;res.json({ok:true,[events>1?'duplicate':'pending']:true});});
app.post('/api/bank-devices/sync',(req,res)=>res.status(req.headers['x-bank-device-token']===token?200:401).json(linked?{state:'linked',station:'duugi',enabled:true}:{state:'pending'}));
const server=http.createServer(app),bus=mount(server,{port:()=>server.address().port});await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='ws://127.0.0.1:'+server.address().port+'/ws/collection';
function open(headers={}){return new Promise(resolve=>{const ws=new WebSocket(url,{headers});const inbox=[],wait=[];ws.on('message',raw=>{const m=JSON.parse(raw);if(wait.length)wait.shift()(m);else inbox.push(m);});ws.next=()=>inbox.length?Promise.resolve(inbox.shift()):new Promise(r=>wait.push(r));ws.sendJson=o=>ws.send(JSON.stringify(o));ws.on('open',()=>resolve(ws));});}
const host='127.0.0.1:'+server.address().port;
const denied=await open({Origin:'http://'+host});denied.sendJson({type:'auth',kind:'web',station:'duugi'});assert.equal((await denied.next()).type,'auth-error');
const web=await open({Origin:'http://'+host,Cookie:'session=ok'});web.sendJson({type:'auth',kind:'web',station:'duugi'});assert.equal((await web.next()).type,'ready');web.sendJson({type:'rpc',id:'1',method:'GET',path:'/api/test?station=duugi'});let m=await web.next();assert.equal(m.status,200);assert.equal(JSON.parse(m.body).cookie,'session=ok');
bus.notify('different','alert',{donor:'secret'});bus.notify('duugi','state');assert.equal((await web.next()).topic,'state');
const source=await open();source.sendJson({type:'auth',kind:'toonie',station:'duugi',token});assert.equal((await source.next()).type,'ready');source.sendJson({type:'event',body:{station:'wrong',eventId:'bad'}});assert.equal((await source.next()).ok,false);assert.equal(events,0);
for(let i=0;i<2;i++){source.sendJson({type:'event',body:{station:'duugi',eventId:'same'}});m=await source.next();assert.equal(m.type,'ack');assert.equal(m.eventId,'same');assert.equal(m.ok,true);}assert.equal(m.duplicate,true);
const device=await open();device.sendJson({type:'auth',kind:'device',token});assert.equal((await device.next()).config.state,'pending');linked=true;await bus.devicesChanged();m=await device.next();assert.equal(m.type,'config');assert.equal(m.config.station,'duugi');
for(const ws of [web,source,device])ws.terminate();await new Promise(r=>server.close(r));console.log('PASS WebSocket: auth, cookie RPC, station isolation, ACK/dedup and pushed device config');})().catch(e=>{console.error(e);process.exit(1)});
