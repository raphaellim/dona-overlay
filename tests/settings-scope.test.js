'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {PGlite}=require('@electric-sql/pglite'),{createPostgresClient}=require('../postgres-client'),cache=require('../database-read-cache');
// Exercise production merge/read/save functions with actual SQL; identity
// normalizers keep this fixture focused on scoping and preservation semantics.
function runtime(client){const source=fs.readFileSync(require.resolve('../server'),'utf8'),context={supabase:client,normalizeSettings:v=>structuredClone(v),effectiveKaraokeData:(global,shared,scoped)=>({...global,...shared,...scoped}),readGlobalSettings:async()=>{const r=await client.from('settings').select('data').eq('id',1).maybeSingle();if(r.error)throw r.error;return r.data.data},withSettingsMutation:fn=>client.uncached(fn),pickScopedSettings:v=>({creators:v.creators,broadcastLiveData:v.broadcastLiveData}),writeGlobalSettings:async value=>{const r=await client.from('settings').upsert({id:1,data:value});if(r.error)throw r.error;return value}};vm.createContext(context);vm.runInContext(source.slice(source.indexOf('function effectiveSettingsFromGlobal('),source.indexOf('async function copySettingsToBroadcast(')),context);return context;}
test('Projected settings: same effective values, no historical transfer, cache invalidation and history-safe saves',async()=>{
 const db=new PGlite();let bytes=0,calls=0;const raw=createPostgresClient({pool:{query:async(sql,args)=>{const r=await db.query(sql,args);if(sql.startsWith('SELECT (data::jsonb')){bytes+=Buffer.byteLength(JSON.stringify(r.rows));calls++;}return r},end:()=>db.close()}}),client=cache(raw);
 try{await db.exec('CREATE TABLE settings(id integer primary key,data jsonb); CREATE TABLE station_bank_devices(id integer primary key,last_seen_at text); INSERT INTO station_bank_devices VALUES(1,\'old\');');
 const shared={title:'빵떠기',notice:'현재 공지',stationStyle:{theme:'gold'},nightbotChat:{enabled:true},fundingData:{items:[{id:'fund',current:125}]},karaokeData:{coins:3}};
 const active={creators:['빵떠기'],broadcastLiveData:{live:true,status:'live'},broadcastTimerData:{mission:'active'},karaokeData:{queue:['현재곡']}},old={creators:['이전'],notice:'old',history:'old-'.repeat(6000)};
 const bucket={_shared:shared,live:active};for(let i=0;i<60;i++)bucket['history-'+i]={...old,index:i};const global={title:'기본',notice:'기본 공지',presets:[{id:'smoke',plusPrice:11900}],karaokeData:{coins:1},sessionSettings:{old:'session'},stationSettings:{duugi:bucket,other:{_shared:{title:'다른 방송국'},live:{creators:['다른 방송인']}}}};
 await client.from('settings').upsert({id:1,data:global});const rootBytes=Buffer.byteLength(JSON.stringify(global));const ctx=runtime(client),withoutMap=o=>JSON.parse(JSON.stringify({...o,stationSettings:undefined,sessionSettings:undefined}));
 const actual=await ctx.readEffectiveSettings('duugi','live'),expected=ctx.effectiveSettingsFromGlobal(global,'duugi','live');assert.deepEqual(withoutMap(actual),withoutMap(expected));assert.deepEqual(JSON.parse(JSON.stringify(actual.stationSettings)),{duugi:{_shared:shared,live:active}});assert.equal(actual.stationSettings.other,undefined);assert.ok(bytes<rootBytes/20,{bytes,rootBytes});
 // Repeated device sync does not force re-transfer of settings.
 for(let i=0;i<30;i++){await client.from('station_bank_devices').update({last_seen_at:String(i)}).eq('id',1);await ctx.readEffectiveSettings('duugi','live');}assert.equal(calls,1);
 const other=await ctx.readEffectiveSettings('other','live');assert.equal(other.title,'다른 방송국');assert.deepEqual(Array.from(other.creators),['다른 방송인']);
 const missing=await ctx.readEffectiveSettings('duugi','missing');assert.equal(missing.title,'빵떠기');assert.equal(missing.stationSettings.duugi['history-0'],undefined);
 const noBroadcast=await ctx.readEffectiveSettings('duugi',null);assert.equal(noBroadcast.stationSettings.duugi.live,undefined);assert.equal(noBroadcast.title,'빵떠기');
 const injected=await raw.readSettingsScope("duugi'); DROP TABLE settings;--",'live');assert.equal(injected.error,null);assert.equal((await db.query('SELECT count(*) n FROM settings')).rows[0].n,1);
 // Production save still reads the full root, preserving all other broadcasts.
 await ctx.saveEffectiveSettings('duugi','live',{creators:['변경'],broadcastLiveData:{live:false,status:'ended'}});
 const stored=(await db.query('SELECT data FROM settings WHERE id=1')).rows[0].data;assert.deepEqual(stored.stationSettings.duugi['history-0'],global.stationSettings.duugi['history-0']);assert.deepEqual(stored.stationSettings.other,global.stationSettings.other);assert.deepEqual(stored.sessionSettings,global.sessionSettings);assert.deepEqual(stored.stationSettings.duugi._shared,shared);assert.deepEqual(stored.stationSettings.duugi.live.creators,['변경']);
 assert.equal((await ctx.readEffectiveSettings('duugi','live')).broadcastLiveData.status,'ended');console.log(JSON.stringify({fixtureFullRootBytes:rootBytes,scopedReadBytes:Buffer.byteLength(JSON.stringify(actual)),historyBroadcasts:60,deviceSyncs:30,initialScopeQueries:1}));
 }finally{await db.close();}
});
