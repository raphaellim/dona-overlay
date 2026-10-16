'use strict';
const crypto = require('node:crypto');
const path = require('node:path');
const MAX=[40,25,15];
const clone=x=>JSON.parse(JSON.stringify(x));
const blank=()=>({title:'백수배 슈퍼스타',stage:'list',participants:[],current:null,event:null,closed:false});
const fail=m=>{throw Error(m);};
function points(p){const rounds=p.rounds;return {judge:rounds.reduce((a,r)=>a+r.scores.reduce((a,n)=>a+(n??0),0),0)/2,support:rounds.reduce((a,r)=>a+Math.min(20,r.amount/1000),0)/2};}
function ready(p){return p.rounds.every(r=>r.scores.every(n=>n!==null));}
function activeReveal(s,p,now){return !!p.revealedAt&&p.revealedAt<=now;}
function publicState(s,revision,now=Date.now()){
 const revealed=s.participants.filter(p=>activeReveal(s,p,now));
 const mode=s.stage==='reveal'||s.stage==='final';
 const entries=s.participants.map(p=>{const v=points(p),is=activeReveal(s,p,now);return {id:p.id,name:p.name,songs:p.rounds.map(r=>r.song),listened:p.listened,support:v.support,amount:p.rounds.reduce((n,r)=>n+r.amount,0),revealed:is,...(is?{judge:v.judge,total:v.judge+v.support,detail:MAX.map((_,i)=>(p.rounds[0].scores[i]+p.rounds[1].scores[i])/2)}:{})};});
 const ordered=entries.filter(p=>!mode||p.revealed).sort((a,b)=>mode?(b.total-a.total||b.judge-a.judge||b.detail[0]-a.detail[0]):b.support-a.support);
 let rank=1;ordered.forEach((p,i)=>{if(i){const prev=ordered[i-1];const tie=mode?p.total===prev.total&&p.judge===prev.judge&&p.detail[0]===prev.detail[0]:p.support===prev.support;if(!tie)rank=i+1;}p.rank=rank;});
 const event=s.event?{id:s.event.id,kind:s.event.kind,at:s.event.at,...(now>=s.event.at?{participantId:s.event.participantId}:{} )}:null;
 return {title:s.title,stage:s.stage,closed:s.closed,current:s.current,revision,participants:entries,ordered:ordered.map(p=>p.id),event,remaining:s.participants.length-revealed.length};
}
function mutate(input,body,now=Date.now()){
 const s=clone(input),p=s.participants.find(p=>p.id===body.id),busy=s.event?.at>now;
 if(busy)fail('점수 공개 연출 중입니다. 잠시 후 다시 눌러주세요.');
 const locked=s.stage==='reveal'||s.stage==='final';
 switch(body.action){
 case 'add':{if(locked)fail('공개 시작 후에는 참가자를 추가할 수 없습니다.');const name=String(body.name||'').trim().slice(0,24);if(!name)fail('닉네임을 입력하세요.');if(s.participants.length>=100)fail('참가자는 최대 100명입니다.');if(s.participants.some(p=>p.name===name))fail('중복 닉네임입니다.');s.participants.push({id:crypto.randomUUID(),name,listened:false,revealedAt:null,rounds:[0,1].map(()=>({song:'',scores:[null,null,null],amount:0}))});break;}
 case 'edit':{if(!p)fail('참가자가 없습니다.');if(locked)fail('공개 시작 후에는 점수를 수정할 수 없습니다.');const r=p.rounds[body.round];if(!r)fail('곡 번호 오류');if(body.song!==undefined)r.song=String(body.song).slice(0,100);if(body.scores){if(!Array.isArray(body.scores)||body.scores.length!==3)fail('심사 항목은 3개입니다.');r.scores=body.scores.map((v,i)=>{if(v===null||v==='')return null;const n=Number(v);if(!Number.isFinite(n)||n<0||n>MAX[i]||n*2!==Math.round(n*2))fail('심사 점수는 배점 내에서 0.5점 단위로 입력하세요.');return n;});}if(body.amount!==undefined){if(s.closed)fail('후원 집계가 마감되었습니다.');const n=Number(body.amount);if(!Number.isSafeInteger(n)||n<0||n>1e12)fail('후원 금액 오류');r.amount=n;}break;}
 case 'delete':if(locked)fail('공개 시작 후 삭제할 수 없습니다.');s.participants=s.participants.filter(p=>p.id!==body.id);break;
 case 'current':if(body.id&&!p)fail('참가자 없음');s.current=body.id||null;break;
 case 'listened':if(!p)fail('참가자 없음');p.listened=!p.listened;break;
 case 'title':s.title=String(body.title||'백수배 슈퍼스타').slice(0,60);break;
 case 'judging':if(locked)fail('이미 공개 중입니다.');s.stage='judging';break;
 case 'close':s.closed=true;break;
 case 'open':if(locked)fail('공개 시작 후 다시 열 수 없습니다.');s.closed=false;break;
 case 'draw':{if(!s.participants.length)fail('참가자를 등록하세요.');if(!s.participants.every(ready))fail('모든 참가자의 두 곡 심사 점수를 먼저 입력하세요.');if(!s.participants.every(p=>p.listened))fail('모든 참가자의 감상 완료를 먼저 표시하세요.');const pool=s.participants.filter(p=>!p.revealedAt);if(!pool.length)fail('모두 공개되었습니다.');const target=pool[crypto.randomInt(pool.length)];s.closed=true;s.stage='reveal';s.current=null;target.revealedAt=now+6000;s.event={id:crypto.randomUUID(),kind:'draw',participantId:target.id,at:target.revealedAt};break;}
 case 'final':if(!s.participants.length||s.participants.some(p=>!activeReveal(s,p,now)))fail('모든 점수를 먼저 공개하세요.');s.stage='final';s.event={id:crypto.randomUUID(),kind:'final',at:now};break;
 case 'reset':if(body.confirm!=='초기화')fail('초기화 확인이 필요합니다.');return blank();
 default:fail('알 수 없는 작업');
 }return s;
}
module.exports=function(app,d){
 const {supabase,getStationContext,stationAllowed,stationTokenAllowed}=d;
 const wrap=fn=>async(req,res)=>{try{await fn(req,res);}catch(e){console.error('[song-contest]',e.message);res.status(400).json({error:e.message});}};
 const context=async(req,res,admin)=>{const c=await getStationContext(req,res);if(!c)return null;const allowed=await stationAllowed(req,c.station);if(admin?!allowed:(!allowed&&!await stationTokenAllowed(req,c.station))){res.status(403).json({error:'방송국 관리자 로그인 또는 올바른 오버레이 토큰이 필요합니다.'});return null;}return c;};
 async function read(id){const {data,error}=await supabase.from('song_contests').select('state,revision').eq('station_id',id).maybeSingle();if(error)throw Error('노래대회 DB 확인: sql/20-song-contest.sql을 실행하세요. '+error.message);return data||{state:blank(),revision:0};}
 app.get('/song-contest-admin.html',wrap(async(req,res)=>{if(!await context(req,res,true))return;res.sendFile(path.join(__dirname,'public/song-contest-admin.html'));}));
 app.get('/song-contest-overlay.html',wrap(async(req,res)=>{if(!await context(req,res,false))return;res.sendFile(path.join(__dirname,'public/song-contest-overlay.html'));}));
 app.get('/api/song-contest/public',wrap(async(req,res)=>{const c=await context(req,res,false);if(!c)return;const r=await read(c.station.id);res.set('Cache-Control','no-store');res.json(publicState(r.state,r.revision));}));
 app.get('/api/song-contest/admin',wrap(async(req,res)=>{const c=await context(req,res,true);if(!c)return;const r=await read(c.station.id);res.set('Cache-Control','no-store');res.json({...r,overlayToken:c.station.overlay_token});}));
 app.post('/api/song-contest/action',wrap(async(req,res)=>{const c=await context(req,res,true);if(!c)return;if(req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)return res.status(403).json({error:'다른 사이트 요청 차단'});const r=await read(c.station.id);if(req.body.revision!==r.revision)return res.status(409).json({error:'다른 작업으로 변경되었습니다. 새로고침 후 다시 입력하세요.'});const state=mutate(r.state,req.body);let result;if(r.revision===0){result=await supabase.from('song_contests').insert({station_id:c.station.id,state,revision:1}).select('revision');}else{result=await supabase.from('song_contests').update({state,revision:r.revision+1,updated_at:new Date().toISOString()}).eq('station_id',c.station.id).eq('revision',r.revision).select('revision');}if(result.error?.code==='23505'||(!result.error&&!result.data?.length))return res.status(409).json({error:'동시 입력 충돌. 새로고침 후 다시 입력하세요.'});if(result.error)throw result.error;res.json({ok:true,revision:r.revision+1,state});}));
};
module.exports.core={blank,points,ready,publicState,mutate};
