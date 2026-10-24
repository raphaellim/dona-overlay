'use strict';
const creatorName=v=>{const s=String(v??'').normalize('NFC').trim();if(!s||Array.from(s).length>40||/[\x00-\x1f\x7f]/u.test(s))throw Error('기본 방송인 이름을 1~40글자로 입력하세요.');return s;};
async function rootOf(supabase){const {data,error}=await supabase.from('settings').select('data').eq('id',3).maybeSingle();if(error&&error.code!=='PGRST116')throw error;return data?.data||{};}
async function read(supabase,slug){const root=await rootOf(supabase);return {creator:String(root.$broadcastDefaults?.[slug]?.creator||''),mode:'solo'};}
async function save({supabase,withSettingsMutation},slug,raw){const creator=creatorName(raw);return withSettingsMutation(async()=>{const root=await rootOf(supabase);const value={creator,mode:'solo'};root.$broadcastDefaults={...root.$broadcastDefaults,[slug]:value};const {error}=await supabase.from('settings').upsert({id:3,data:root,updated_at:new Date().toISOString()},{onConflict:'id'});if(error)throw error;return value;});}
async function resolve({supabase,station,mode}){if(mode==='collab')return {mode:'collab',creator:''};const value=await read(supabase,station.slug);if(!value.creator)throw Error('이 방송국의 기본 방송인이 지정되지 않았습니다. 방송 운영 → 현재 방송 → 새 방송 기본 설정에서 먼저 저장하세요.');return {mode:'solo',creator:creatorName(value.creator)};}
function plan(settings,catalog,normalizeConfig,mode='solo',creator=''){
 if(mode==='solo'){const name=creatorName(creator),registered=(catalog?.targets||[]).find(t=>t.name===name&&t.group!=='other');return normalizeConfig({mode:'solo',targets:[{...(registered||{}),name,group:'streamer',active:true}]});}
 const names=(settings.creators||[]).map(String),config=normalizeConfig(catalog||{targets:names.map(name=>({name,group:'streamer',active:true,aliases:[]}))});for(const name of names)if(!config.targets.some(t=>t.name===name))config.targets.push(normalizeConfig({targets:[{name,group:'streamer',active:true}]}).targets[0]);if(names.length)config.targets=config.targets.filter(t=>names.includes(t.name));config.mode='collab';return config;
}
async function create({supabase,readEffectiveSettings,saveEffectiveSettings,station,broadcast,mode,defaultCreator}){
 const selected=defaultCreator===undefined?await resolve({supabase,station,mode}):{mode:mode==='collab'?'collab':'solo',creator:defaultCreator};const settings=await readEffectiveSettings(station.slug,broadcast.id);const {data,error}=await supabase.from('station_collection_rules').select('config').eq('station_id',station.id).maybeSingle();if(error)throw error;const config=plan(settings,data?.config,require('./donation-routing').normalizeConfig,selected.mode,selected.creator);
 const saved=await supabase.from('broadcast_collection_rules').upsert({station_id:station.id,broadcast_id:broadcast.id,config});if(saved.error)throw saved.error;
 if(selected.mode==='solo')await saveEffectiveSettings(station.slug,broadcast.id,{creators:[selected.creator]});return config;
}
function register(app,d){async function context(req,res){const c=await d.getStationContext(req,res);if(!c)return null;if(!await d.stationAllowed(req,c.station)){res.status(403).json({error:'방송국 관리자 전용 설정입니다.'});return null;}return c;}
 app.get('/api/station/broadcast-defaults',async(req,res)=>{try{const c=await context(req,res);if(!c)return;res.set('Cache-Control','no-store');res.json(await read(d.supabase,c.station.slug));}catch(e){res.status(400).json({error:e.message});}});
 app.post('/api/station/broadcast-defaults',async(req,res)=>{try{const c=await context(req,res);if(!c)return;const value=await save(d,c.station.slug,req.body.creator);res.json({ok:true,...value});}catch(e){res.status(400).json({error:e.message});}});
}
module.exports={creatorName,read,save,resolve,plan,create,register};
