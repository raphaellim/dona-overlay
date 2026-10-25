'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite'),{createPostgresClient}=require('../postgres-client');
test('Production SQL functions via adapter: duplicate donation prevention, funding atomicity, queue ownership',async()=>{
 const db=new PGlite(),c=createPostgresClient({pool:{query:(q,p)=>db.query(q,p),end:()=>db.close()}});
 try{
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;
 CREATE TABLE donations(id uuid primary key default gen_random_uuid(),station_id uuid,broadcast_id uuid,created_at timestamptz default now(),creator text,checks jsonb default '[]',total_amount bigint);
 CREATE TABLE settings(id int primary key,data jsonb,updated_at timestamptz);INSERT INTO settings VALUES(1,'{"fundingData":{"items":[{"id":"fund-1","current":0}]}}',now());`);
 await db.exec(fs.readFileSync('sql/001_runtime_jobs.sql','utf8'));await db.exec(fs.readFileSync('sql/002_alert_manual_queue.sql','utf8'));
 const a='10000000-0000-0000-0000-000000000001',b='10000000-0000-0000-0000-000000000002';
 const args={p_station:'duugi',p_broadcast:b,p_key:'request-123',p_rows:[{station_id:a,broadcast_id:b,total_amount:5000,creator:'떠기',checks:[{presetId:'p1',count:2,side:'plus'}]}],p_funding_id:'fund-1',p_units:0.5};
 const first=await c.rpc('overlay_insert_donations',args);assert.equal(first.error,null);assert.equal(first.data.duplicate,false);assert.equal(first.data.rows[0].total_amount,5000);
 assert.equal((await c.rpc('overlay_insert_donations',args)).data.duplicate,true);
 assert.equal((await c.from('donations').select()).data.length,1);
 const g=(await c.from('settings').select().single()).data.data;assert.equal(g.stationSettings.duugi._shared.fundingData.items[0].current,0.5);
 const bad=await c.rpc('overlay_insert_donations',{...args,p_key:'bad-request-1',p_funding_id:'missing'});assert.ok(bad.error);assert.equal((await c.from('donations').select()).data.length,1);
 assert.equal((await c.rpc('overlay_preset_current',{p_station:a,p_broadcast:b,p_creator:'떠기',p_preset:'p1'})).data,2);
 await c.from('overlay_runtime_jobs').insert({kind:'alert',station:'duugi',broadcast:b,event_key:'event-1',payload:{amount:5000}});
 const job=await c.rpc('overlay_claim_job',{p_kind:'alert',p_station:'duugi',p_owner:'player-1',p_broadcast:b,p_manual_only:false});assert.equal(job.error,null);assert.ok(job.data.id);
 assert.equal((await c.rpc('overlay_claim_job',{p_kind:'alert',p_station:'duugi',p_owner:'player-2',p_broadcast:b})).data.busy,true);
 const touch={p_id:job.data.id,p_station:'duugi',p_owner:'player-1',p_action:'done'};assert.equal((await c.rpc('overlay_touch_job',{...touch,p_owner:'player-2'})).data,false);assert.equal((await c.rpc('overlay_touch_job',touch)).data,true);
 }finally{await db.close();}
});
