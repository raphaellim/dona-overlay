'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {PGlite}=require('@electric-sql/pglite');
const {createPostgresClient}=require('../postgres-client');
const {filterFor,readRelated}=require('../collection-history-query');
test('Postgres adapter: real SQL, JSON arrays, composite upsert, predicates, RPC and isolation',async()=>{
 const db=new PGlite();const pool={query:(sql,args)=>db.query(sql,args),end:()=>db.close()};const c=createPostgresClient({pool});
 try{
 await db.exec(`CREATE TABLE stations(id uuid primary key,slug text unique);CREATE TABLE broadcasts(id uuid primary key,station_id uuid,title text,is_active boolean default true);CREATE TABLE donations(id uuid primary key,station_id uuid,broadcast_id uuid,created_at timestamptz default now(),checks jsonb default '[]',memo text,amount bigint);CREATE TABLE rules(station_id uuid,broadcast_id uuid,config jsonb,primary key(station_id,broadcast_id));CREATE FUNCTION test_json(p_rows jsonb,p_name text) RETURNS jsonb LANGUAGE SQL AS $$ SELECT jsonb_build_object('rows',p_rows,'name',p_name) $$;`);
 const a='10000000-0000-0000-0000-000000000001',b='10000000-0000-0000-0000-000000000002',r='10000000-0000-0000-0000-000000000003';
 assert.equal((await c.from('stations').insert({id:a,slug:"방송'; DROP TABLE stations;--"}).select().single()).error,null);
 assert.equal((await c.from('stations').select().single()).data.id,a);
 assert.equal((await c.from('stations').select().eq('id',b).maybeSingle()).data,null);
 assert.equal((await c.from('stations').select().eq('id',b).single()).error.code,'PGRST116');
 await c.from('stations').insert({id:b,slug:'other'});
 assert.equal((await c.from('stations').select().maybeSingle()).error.code,'PGRST116');
 await c.from('donations').insert([{id:r,station_id:a,broadcast_id:b,checks:[{meta:true,captureId:r}],memo:'프리셋 수동',amount:2000}]);
 const related=await readRelated(c,a,b,[{id:r}]);assert.equal(related.length,1);assert.deepEqual(related[0].checks,[{meta:true,captureId:r}]);
 assert.equal((await c.from('donations').select().eq('station_id',b)).data.length,0);
 assert.equal((await c.from('donations').select().contains('checks',[{captureId:r}])).data.length,1);
 assert.equal((await c.from('donations').select().ilike('memo','%수동%').gte('amount',1000).in('id',[r]).order('id').range(0,0)).data.length,1);
 assert.equal((await c.from('donations').select().in('id',[])).data.length,0);
 let out=await c.from('rules').upsert({station_id:a,broadcast_id:b,config:{hello:[1,2]}}).select().single();assert.equal(out.error,null);assert.deepEqual(out.data.config,{hello:[1,2]});
 out=await c.from('rules').upsert({station_id:a,broadcast_id:b,config:{hello:[3]}}).select().single();assert.deepEqual(out.data.config,{hello:[3]});
 out=await c.from('rules').upsert({station_id:a,broadcast_id:b,config:{}},{ignoreDuplicates:true}).select();assert.equal(out.data.length,0);
 out=await c.from('rules').update({config:[1,2]}).eq('station_id',a).select().single();assert.deepEqual(out.data.config,[1,2]);
 out=await c.rpc('test_json',{p_name:"x'); DROP TABLE stations;--",p_rows:[{x:1}]});assert.deepEqual(out.data.rows,[{x:1}]);
 await db.exec(`CREATE FUNCTION test_array(p_stations uuid[]) RETURNS TABLE(station_id uuid) LANGUAGE SQL AS $$ SELECT unnest(p_stations) $$;`);
 out=await c.rpc('test_array',{p_stations:[a,b]});assert.deepEqual(out.data,[{station_id:a},{station_id:b}]);
 await db.exec(`CREATE FUNCTION test_bool(p_yes boolean DEFAULT true) RETURNS boolean LANGUAGE SQL AS $$ SELECT p_yes $$;`);
 assert.equal((await c.rpc('test_bool',{})).data,true);
 assert.equal((await c.from('rules').delete().eq('station_id',b).select()).data.length,0);
 assert.equal((await c.from('rules').delete().eq('station_id',a).select()).data.length,1);
 assert.equal((await c.from('rules').select()).data.length,0);
 assert.throws(()=>c.from('stations').order('id;drop table stations'));
 assert.equal((await c.from('stations;drop').select()).error.code,'DB_ERROR');
 }finally{await db.close();}
});
