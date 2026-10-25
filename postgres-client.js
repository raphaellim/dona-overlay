'use strict';
// Only the query operations used by this application are supported. All values
// are bound parameters; table/column/function names are strict identifiers.
const ident = s => { if (!/^[a-z_][a-z0-9_]*$/i.test(s)) throw Error('Invalid SQL identifier'); return '"'+s+'"'; };
const columns = s => s === '*' ? '*' : s.split(',').map(x=>ident(x.trim())).join(',');
const resultError = e => ({data:null,error:{message:e.message,code:e.code||'DB_ERROR',details:e.detail||null},count:null});
function safeRows(rows) {
  // PostgREST returns JSON numbers, while pg returns int8/numeric as strings.
  // Reject unsafe integers instead of silently rounding IDs or amounts.
  return rows.map(row=>Object.fromEntries(Object.entries(row).map(([k,v])=>{
    if(v instanceof Date)return [k,v.toISOString()];
    return [k,v];
  })));
}
function splitLogic(s) {
  const out=[];let start=0,quoted=false,escaped=false;
  for(let i=0;i<s.length;i++) {const c=s[i];if(escaped){escaped=false;continue;}if(c==='\\'&&quoted){escaped=true;continue;}if(c==='"')quoted=!quoted;if(c===','&&!quoted){out.push(s.slice(start,i));start=i+1;}}
  if(quoted)throw Error('Invalid OR expression');out.push(s.slice(start));return out;
}
class Query {
 constructor(client,table){this.client=client;this.table=table;this.op='select';this.cols='*';this.filters=[];this.orders=[];this.values=[];this.returning=false;this.mode='many';}
 select(cols='*',options={}){this.cols=cols;this.returning=true;this.options=options;return this;}
 insert(rows){this.op='insert';this.rows=Array.isArray(rows)?rows:[rows];return this;}
 upsert(rows,options={}){this.insert(rows);this.op='upsert';this.conflict=options.onConflict;this.ignore=!!options.ignoreDuplicates;return this;}
 update(row){this.op='update';this.row=row;return this;}
 delete(){this.op='delete';return this;}
 eq(c,v){return this.filter(c,'=',v);} neq(c,v){return this.filter(c,'<>',v);}
 gt(c,v){return this.filter(c,'>',v);} gte(c,v){return this.filter(c,'>=',v);}
 lt(c,v){return this.filter(c,'<',v);} lte(c,v){return this.filter(c,'<=',v);}
 ilike(c,v){return this.filter(c,'ILIKE',v);}
 contains(c,v){this.filters.push({c,op:'@>',v,json:true});return this;}
 is(c,v){if(v!==null&&typeof v!=='boolean')throw Error('Invalid IS value');this.filters.push({c,op:'IS',v});return this;}
 in(c,v){if(!Array.isArray(v))throw Error('IN needs array');this.filters.push({c,op:'IN',v});return this;}
 filter(c,op,v){this.filters.push({c,op,v});return this;}
 or(s){this.filters.push({or:splitLogic(s).map(part=>{const m=part.match(/^([a-z_][a-z0-9_]*)\.cs\.(.*)$/i);if(!m)throw Error('Unsupported OR expression');const decoded=JSON.parse(m[2]);const v=typeof decoded==='string'?JSON.parse(decoded):decoded;return {c:m[1],op:'@>',v,json:true};})});return this;}
 order(c,o={}){ident(c);this.orders.push({c,asc:o.ascending!==false,nullsFirst:o.nullsFirst});return this;}
 limit(n){if(!Number.isSafeInteger(n)||n<0)throw Error('Invalid limit');this.take=n;return this;}
 range(a,b){if(!Number.isSafeInteger(a)||a<0||!Number.isSafeInteger(b)||b<a)throw Error('Invalid range');this.skip=a;this.take=b-a+1;return this;}
 single(){this.mode='single';return this;} maybeSingle(){this.mode='maybe';return this;}
 bind(v){this.values.push(v);return '$'+this.values.length;}
 condition(f){if(f.or)return '('+f.or.map(x=>this.condition(x)).join(' OR ')+')';const c=ident(f.c);
  if(f.op==='IS')return c+' IS '+(f.v===null?'NULL':f.v?'TRUE':'FALSE');
  if(f.op==='IN')return f.v.length?c+' IN ('+f.v.map(v=>this.bind(v)).join(',')+')':'FALSE';
  return c+' '+f.op+' '+this.bind(f.json?JSON.stringify(f.v):f.v)+(f.json?'::jsonb':'');
 }
 async execute(){try{
  this.values=[];const table='public.'+ident(this.table);let sql;
  if(this.op==='select')sql='SELECT '+columns(this.cols)+' FROM '+table;
  else if(this.op==='delete')sql='DELETE FROM '+table;
  else if(this.op==='update') {const keys=Object.keys(this.row).filter(k=>this.row[k]!==undefined);if(!keys.length)throw Error('Empty update');const types=await this.client.columnTypes(this.table);sql='UPDATE '+table+' SET '+keys.map(k=>ident(k)+'='+this.bind(this.encode(this.row[k],types[k]))).join(',');}
  else {
   if(!this.rows.length)return {data:this.returning?[]:null,error:null};
   const keys=[...new Set(this.rows.flatMap(r=>Object.keys(r).filter(k=>r[k]!==undefined)))];if(!keys.length)throw Error('Empty insert');
   const types=await this.client.columnTypes(this.table);
   sql='INSERT INTO '+table+' ('+keys.map(ident).join(',')+') VALUES '+this.rows.map(row=>'('+keys.map(k=>row[k]===undefined?'DEFAULT':this.bind(this.encode(row[k],types[k]))).join(',')+')').join(',');
   if(this.op==='upsert') {const conflict=this.conflict?this.conflict.split(',').map(x=>x.trim()):await this.client.primaryKey(this.table);if(!conflict.length)throw Error('Upsert requires a primary key or onConflict');const changed=keys.filter(k=>!conflict.includes(k));sql+=' ON CONFLICT ('+conflict.map(ident).join(',')+') DO '+(this.ignore||!changed.length?'NOTHING':'UPDATE SET '+changed.map(k=>ident(k)+'=EXCLUDED.'+ident(k)).join(','));}
  }
  if(this.filters.length)sql+=' WHERE '+this.filters.map(f=>this.condition(f)).join(' AND ');
  if(this.op==='select'){
   if(this.orders.length)sql+=' ORDER BY '+this.orders.map(o=>ident(o.c)+(o.asc?' ASC':' DESC')+(o.nullsFirst===undefined?'':o.nullsFirst?' NULLS FIRST':' NULLS LAST')).join(',');
   if(this.take!==undefined)sql+=' LIMIT '+this.bind(this.take);if(this.skip)sql+=' OFFSET '+this.bind(this.skip);
  }else if(this.returning)sql+=' RETURNING '+columns(this.cols);
  const r=await this.client.pool.query(sql,this.values);const rows=safeRows(r.rows);
  if(this.mode!=='many') {if(rows.length>1||(this.mode==='single'&&rows.length!==1))return resultError(Object.assign(Error('Expected a single row'),{code:'PGRST116'}));return {data:rows[0]||null,error:null};}
  return {data:this.op==='select'||this.returning?rows:null,error:null,count:this.options?.count?r.rowCount:null};
 }catch(e){return resultError(e);}}
 encode(v,t){return v!==null&&(t==='json'||t==='jsonb')?JSON.stringify(v):v;}
 then(a,b){return this.execute().then(a,b);} catch(b){return this.execute().catch(b);}
}
function createPostgresClient({connectionString,pool}={}) {
 if(!pool){const {Pool,types}=require('pg');const parsers=Object.create(types);
  parsers.getTypeParser=(oid,format)=>Number(oid)===1082&&format!=='binary'?v=>v:[20,1700].includes(Number(oid))&&format!=='binary'?v=>{const n=Number(v);if(!Number.isFinite(n)||(Number.isInteger(n)&&!Number.isSafeInteger(n)))throw Error('Database number exceeds safe range');return n;}:types.getTypeParser(oid,format);
  pool=new Pool({connectionString,types:parsers,max:3,idleTimeoutMillis:10000,connectionTimeoutMillis:15000,statement_timeout:30000});
  pool.on('error',()=>console.error('[database] idle connection interrupted'));
 }
 const metadata=new Map(),functions=new Map();
 const client={pool,from:table=>new Query(client,table),async readSettingsScope(stationSlug,broadcastId){try{
  // Project JSON inside Postgres: historical broadcasts never cross the network.
  // This is read-only. Full-root reads remain available for serialized saves.
  const r=await pool.query(`SELECT (data::jsonb - 'stationSettings' - 'sessionSettings') ||
   jsonb_build_object('stationSettings',jsonb_build_object($1::text,
    jsonb_build_object('_shared',COALESCE(data::jsonb #> ARRAY['stationSettings',$1::text,'_shared'],'{}'::jsonb)) ||
    CASE WHEN $2::text IS NULL THEN '{}'::jsonb ELSE jsonb_build_object($2::text,
     COALESCE(data::jsonb #> ARRAY['stationSettings',$1::text,$2::text],'{}'::jsonb)) END
   )) AS data FROM public.settings WHERE id=1`,[String(stationSlug),broadcastId==null?null:String(broadcastId)]);
  return {data:r.rows[0]||null,error:null};
 }catch(e){return resultError(e);}},async columnTypes(table){return (await meta(table)).types;},async primaryKey(table){return (await meta(table)).pk;},async rpc(name,args={}){try{
  ident(name);const keys=Object.keys(args);keys.forEach(ident);
  if(!functions.has(name)){const task=pool.query(`SELECT p.proargnames AS names,p.pronargs AS nargs,p.pronargdefaults AS defaults,p.proretset AS setof,
 ARRAY(SELECT format_type(t,NULL) FROM unnest(p.proargtypes::oid[]) WITH ORDINALITY AS x(t,pos) ORDER BY pos) AS types
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname=$1`,[name]).then(r=>r.rows);functions.set(name,task);task.catch(()=>functions.delete(name));}
  const candidates=(await functions.get(name)).filter(f=>{const names=(f.names||[]).slice(0,f.nargs);return keys.every(k=>names.includes(k))&&names.slice(0,f.nargs-f.defaults).every(k=>keys.includes(k));});
  if(candidates.length!==1)throw Error('Missing or ambiguous database function: '+name);
  const f=candidates[0],types=keys.map(k=>f.types[f.names.indexOf(k)]);
  const call='public.'+ident(name)+'('+keys.map((k,i)=>ident(k)+' => $'+(i+1)+'::'+types[i]).join(',')+')';
  const sql=f.setof?'SELECT to_jsonb(r) AS value FROM (SELECT * FROM '+call+') AS r':'SELECT to_jsonb('+call+') AS value';
  const r=await pool.query(sql,keys.map((k,i)=>['json','jsonb'].includes(types[i])?JSON.stringify(args[k]):args[k]));
  return {data:f.setof?r.rows.map(r=>r.value):r.rows[0]?.value??null,error:null};
 }catch(e){return resultError(e);}},close:()=>pool.end()};
 async function meta(table){ident(table);if(!metadata.has(table)){const task=pool.query(`SELECT a.attname AS name,t.typname AS type,COALESCE(a.attnum = ANY(i.indkey),false) AS pk
 FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_type t ON t.oid=a.atttypid
 LEFT JOIN pg_index i ON i.indrelid=c.oid AND i.indisprimary
 WHERE n.nspname='public' AND c.relname=$1 AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum`,[table]).then(r=>({types:Object.fromEntries(r.rows.map(x=>[x.name,x.type])),pk:r.rows.filter(x=>x.pk).map(x=>x.name)}));metadata.set(table,task);task.catch(()=>metadata.delete(table));}return metadata.get(table);}
 return client;
}
module.exports={createPostgresClient};
