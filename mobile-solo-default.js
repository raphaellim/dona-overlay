'use strict';
const {normalizeConfig}=require('./donation-routing');
module.exports=function({supabase,saveEffectiveSettings}){
 async function plan(device,station,settings){
  const {data,error}=await supabase.from('station_collection_rules').select('config').eq('station_id',station.id).maybeSingle();if(error)throw error;
  const names=Array.isArray(settings.creators)?settings.creators:[];
  const catalog=normalizeConfig(data?.config||{targets:names.map(name=>({name,group:'streamer'}))});
  for(const name of names)if(!catalog.targets.some(t=>t.name===name))catalog.targets.push(normalizeConfig({targets:[{name,group:'streamer'}]}).targets[0]);
  const active=catalog.targets.filter(t=>t.group==='streamer'&&t.active);
  const selected=String(device.creator||'').trim()||(active.length===1?active[0].name:'');
  if(!selected)throw Error('기본 크리에이터를 먼저 설정하세요. 웹 은행 수집 기기 관리에서 기본 크리에이터를 지정하면 새 방송은 개인방송으로 시작합니다.');
  let target=catalog.targets.find(t=>t.name===selected);
  if(target&&target.group!=='streamer')throw Error('기본 크리에이터는 방송인 그룹으로 설정하세요.');
  if(!target){target=normalizeConfig({targets:[{name:selected,group:'streamer'}]}).targets[0];catalog.targets.push(target);}
  return normalizeConfig({mode:'solo',targets:catalog.targets.map(t=>({...t,active:t.group==='streamer'?t.name===selected:t.active}))});
 }
 async function apply(station,broadcastId,config){
  if(!config||config.mode!=='solo'||config.targets.filter(t=>t.group==='streamer'&&t.active).length!==1)throw Error('개인방송 기본 크리에이터 설정을 확인하세요.');
  const {error}=await supabase.from('broadcast_collection_rules').upsert({station_id:station.id,broadcast_id:broadcastId,config});if(error)throw error;
  await saveEffectiveSettings(station.slug,broadcastId,{creators:config.targets.map(t=>t.name)});
 }
 return {plan,apply};
};
