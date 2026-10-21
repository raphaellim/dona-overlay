'use strict';
// Uses the same station scope, settings mutation queue and live-data shape as the web controls.
module.exports=function({supabase,withSettingsMutation,ensureActiveBroadcast,readEffectiveSettings,saveEffectiveSettings,setActiveBroadcast,getStationBroadcastOrNull,copySettingsToBroadcast,sessions,changed}){
 const locks=new Map(),valid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
 const live=x=>x?.live===true&&x?.status==='live';
 const stamp=x=>String(x?.collectionStartedAt||x?.startedAt||'');
 async function serial(st,fn){const prev=locks.get(st)||Promise.resolve(),next=prev.catch(()=>{}).then(fn);locks.set(st,next);try{return await next;}finally{if(locks.get(st)===next)locks.delete(st);}}
 async function data(){const {data,error}=await supabase.from('settings').select('data').eq('id',3).maybeSingle();if(error)throw error;return data?.data||{};}
 async function operation(st,id){const root=await data();return root.$mobileBroadcastOps?.[String(st)]?.[id]||null;}
 async function save(st,id,value){await withSettingsMutation(async()=>{const root=await data();root.$mobileBroadcastOps||={};root.$mobileBroadcastOps[String(st)]||={};root.$mobileBroadcastOps[String(st)][id]=value;const {error}=await supabase.from('settings').upsert({id:3,data:root,updated_at:new Date().toISOString()},{onConflict:'id'});if(error)throw error;});}
 async function connect(device,station,b){return serial(String(station.id),async()=>{
  if(device.state!=='linked'||device.enabled!==true)throw Error('서버에서 이 기기의 수집을 허용하세요.');
  if(!valid(b.requestId))throw Error('방송 연결 요청 ID를 확인하세요.');
  let op=await operation(station.id,b.requestId);
  if(op&&(op.deviceId!==String(device.id)||op.stationId!==String(station.id)))throw Error('다른 기기의 방송 요청입니다.');
  if(op?.phase==='ended')throw Error('이미 종료한 연결 요청입니다. 새로 방송을 선택하세요.');
  if(op?.phase==='done'){
   const snapshot=await sessions.snapshot(device,station);
   if(!snapshot.collectionActive||snapshot.collectionSessionId!==op.sessionId)throw Error('방송이 종료·변경되었습니다. 새로 연결하세요.');
   return {ok:true,...snapshot};
  }
  if(!op){
   if(b.resume===true)throw Error('서버에 확인된 연결 요청이 없습니다. OFF 후 다시 방송을 선택하세요.');
   if(!['new','existing'].includes(b.mode))throw Error('새 방송 또는 기존 방송을 선택하세요.');
   const current=await ensureActiveBroadcast(station.id);
   if(String(current.id)!==String(b.expectedActiveId))throw Error('현재 방송이 변경되었습니다. 목록을 새로 불러오세요.');
   const currentSettings=await readEffectiveSettings(station.slug,current.id);
   const targetId=b.mode==='new'?b.requestId:String(b.broadcastId||'');
   if(live(currentSettings.broadcastLiveData)&&String(current.id)!==targetId)throw Error('다른 방송이 진행 중입니다. 기존 방송을 종료한 뒤 새 방송을 연결하세요.');
   const title=String(b.title||'').trim();if(b.mode==='new'&&(!title||title.length>100||String(b.broadcastPassword||'').length>100))throw Error('방송 제목·입장 비밀번호를 확인하세요.');
   if(b.mode==='existing'&&!await getStationBroadcastOrNull(station.id,targetId))throw Error('이 방송국의 방송을 선택하세요.');
   op={deviceId:String(device.id),stationId:String(station.id),targetId,mode:b.mode,title,expectedActiveId:String(current.id),phase:'pending',runStamp:live(currentSettings.broadcastLiveData)&&String(current.id)===targetId?stamp(currentSettings.broadcastLiveData):new Date().toISOString()};
   await save(station.id,b.requestId,op);
  }
  let target=await getStationBroadcastOrNull(station.id,op.targetId);
  if(!target){
   if(op.mode!=='new'||!Object.hasOwn(b,'broadcastPassword'))throw Error('생성 요청을 다시 확인해야 합니다. OFF 후 방송 목록을 확인하세요.');
   const {error}=await supabase.from('broadcasts').insert({id:op.targetId,station_id:station.id,title:op.title,broadcast_password:String(b.broadcastPassword||''),memo:'',is_active:false});if(error)throw error;
   target=await getStationBroadcastOrNull(station.id,op.targetId);
  }
  if(op.mode==='new'&&!op.settingsCopied){await copySettingsToBroadcast(station.slug,op.targetId);op.settingsCopied=true;await save(station.id,b.requestId,op);}
  const current=await ensureActiveBroadcast(station.id);
  if(String(current.id)!==op.expectedActiveId&&String(current.id)!==op.targetId)throw Error('다른 방송으로 변경되어 시작을 중지했습니다.');
  let settings=await readEffectiveSettings(station.slug,op.targetId),previous=settings.broadcastLiveData;
  if(previous?.status==='ended'&&String(previous.startedAt||'')===op.runStamp)throw Error('종료된 방송 요청은 다시 시작하지 않습니다.');
  if(op.phase==='started'&&(!live(previous)||stamp(previous)!==op.runStamp))throw Error('방송이 종료·변경되었습니다. 새로 선택하세요.');
  await setActiveBroadcast(station.id,op.targetId);
  if(!live(previous)||stamp(previous)!==op.runStamp){await saveEffectiveSettings(station.slug,op.targetId,{broadcastLiveData:{status:'live',live:true,startedAt:op.runStamp,collectionStartedAt:op.runStamp,endedAt:''}});}
  op.phase='started';await save(station.id,b.requestId,op);
  let snapshot=await sessions.snapshot(device,station);if(!snapshot.collectionActive)snapshot=await sessions.connect(device,station);
  if(snapshot.broadcastId!==op.targetId||snapshot.broadcastLiveStamp!==op.runStamp)throw Error('방송 연결 검증 실패');
  op.phase='done';op.sessionId=snapshot.collectionSessionId;await save(station.id,b.requestId,op);
  await Promise.resolve(changed()).catch(()=>{});return {ok:true,...snapshot};
 });}
 async function end(device,station,b){return serial(String(station.id),async()=>{
  let op=b.requestId?await operation(station.id,b.requestId):null;
  if(op&&op.deviceId!==String(device.id))throw Error('다른 기기의 종료 요청입니다.');
  if(op?.phase==='ended')return {ok:true,ended:true};
  const targetId=String(b.broadcastId||op?.targetId||'');
  if(!targetId){if(valid(b.requestId)&&!op){await save(station.id,b.requestId,{deviceId:String(device.id),stationId:String(station.id),phase:'ended'});return {ok:true,ended:true};}throw Error('종료할 방송 연결 정보가 없습니다.');}
  const target=await getStationBroadcastOrNull(station.id,targetId);if(!target){if(op){op.phase='ended';await save(station.id,b.requestId,op);}return {ok:true,ended:true};}
  const settings=await readEffectiveSettings(station.slug,targetId),previous=settings.broadcastLiveData;
  if(live(previous)){
   const snapshot=await sessions.snapshot(device,station),session=String(b.collectionSessionId||op?.sessionId||'');
   const expectedStamp=String(b.broadcastLiveStamp||op?.runStamp||'');
   const owned=snapshot.collectionActive&&snapshot.broadcastId===targetId&&snapshot.collectionSessionId===session;
   const pendingOwned=op&&op.targetId===targetId&&op.deviceId===String(device.id)&&op.runStamp===expectedStamp;
   if((!owned&&!pendingOwned)||stamp(previous)!==expectedStamp)throw Error('방송 연결이 변경되어 종료하지 않았습니다. 웹에서 방송 상태를 확인하세요.');
   await saveEffectiveSettings(station.slug,targetId,{broadcastLiveData:{status:'ended',live:false,startedAt:previous.startedAt||'',collectionStartedAt:previous.collectionStartedAt||'',endedAt:new Date().toISOString()}});
  }
  if(op){op.phase='ended';await save(station.id,b.requestId,op);}
  await sessions.disconnect(device,String(b.collectionSessionId||op?.sessionId||''));
  await Promise.resolve(changed()).catch(()=>{});return {ok:true,ended:true,broadcastId:targetId};
 });}
 return {connect,end};
};
