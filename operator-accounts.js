'use strict';
const crypto=require('crypto'),{promisify}=require('util');const scrypt=promisify(crypto.scrypt);
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
async function passwordHash(password){const salt=crypto.randomBytes(16).toString('hex');return salt+':'+(await scrypt(password,salt,64)).toString('hex');}
async function passwordMatches(password,value){const [salt,key]=String(value).split(':');if(!salt||!key)return false;const b=await scrypt(password,salt,64),a=Buffer.from(key,'hex');return a.length===b.length&&crypto.timingSafeEqual(a,b);}
module.exports=function(app,d){
 const {supabase,getStation,getStationContext,stationAllowed,parseCookies}=d;
 const attempts=new Map();
 async function loadActor(req){if(!supabase)return null;const raw=parseCookies(req).operator_session;if(!raw)return null;
 const {data:session,error}=await supabase.from('station_operator_sessions').select('*').eq('token_hash',hash(raw)).gt('expires_at',new Date().toISOString()).maybeSingle();if(error)throw error;if(!session)return null;
 const {data:account,error:err}=await supabase.from('station_operator_accounts').select('*').eq('id',session.account_id).eq('station_id',session.station_id).eq('enabled',true).maybeSingle();if(err)throw err;
 if(!account||account.session_version!==session.session_version)return null;return {id:account.id,stationId:account.station_id,name:account.display_name,username:account.username,permissions:account.permissions||{}};
 }
 function cookie(res,name,value,age,req){const secure=req.secure||req.headers['x-forwarded-proto']==='https';res.append('Set-Cookie',`${name}=${encodeURIComponent(value)}; Max-Age=${age}; Path=/; HttpOnly; SameSite=Strict${secure?'; Secure':''}`);}
 const wrap=fn=>async(req,res)=>{try{if(!supabase)return res.status(503).json({error:'데이터베이스 설정 필요'});await fn(req,res);}catch(e){res.status(500).json({error:e.message});}};
 function publicAccount(a){return {id:a.id,username:a.username,displayName:a.display_name,enabled:a.enabled,permissions:a.permissions};}
 app.post('/api/operator-login',wrap(async(req,res)=>{
 const station=await getStation(String(req.body.station||''));const username=String(req.body.username||'').trim().toLowerCase(),password=String(req.body.password||'');
 const key=(req.socket.remoteAddress||'')+'|'+String(req.body.station)+'|'+username,now=Date.now(),hit=attempts.get(key);if(hit&&hit.until>now&&hit.count>=8)return res.status(429).json({error:'잠시 후 다시 로그인하세요'});
 const entry=hit&&hit.until>now?hit:{count:0,until:now+900000};entry.count++;attempts.set(key,entry);if(attempts.size>5000)attempts.delete(attempts.keys().next().value);
 const {data,error}=station?await supabase.from('station_operator_accounts').select('*').eq('station_id',station.id).eq('username',username).eq('enabled',true).maybeSingle():{data:null};if(error)throw error;
 if(!data||password.length>200||!await passwordMatches(password,data.password_hash))return res.status(401).json({error:'방송국·아이디·비밀번호를 확인하세요'});
 attempts.delete(key);const token=crypto.randomBytes(32).toString('hex');const result=await supabase.from('station_operator_sessions').insert({token_hash:hash(token),station_id:station.id,account_id:data.id,session_version:data.session_version,expires_at:new Date(now+43200000).toISOString()});if(result.error)throw result.error;
 cookie(res,'operator_session',token,43200,req);cookie(res,'station_slug',station.slug,43200,req);cookie(res,'station_admin_password','',0,req);cookie(res,'admin_password','',0,req);
 res.json({ok:true,actor:publicAccount(data)});
 }));
 app.get('/api/operators',wrap(async(req,res)=>{const ctx=await getStationContext(req,res);if(!ctx)return;if(!await stationAllowed(req,ctx.station))return res.status(403).json({error:'방송국 관리자 전용'});const {data,error}=await supabase.from('station_operator_accounts').select('*').eq('station_id',ctx.station.id).order('created_at');if(error)throw error;res.json({accounts:(data||[]).map(publicAccount)});}));
 app.post('/api/operators',wrap(async(req,res)=>{const ctx=await getStationContext(req,res);if(!ctx)return;if(!await stationAllowed(req,ctx.station))return res.status(403).json({error:'방송국 관리자 전용'});
 const b=req.body,username=String(b.username||'').trim().toLowerCase(),name=String(b.displayName||'').trim(),password=String(b.password||'');if(!/^[a-z0-9_.-]{3,40}$/.test(username)||!name||name.length>80||password.length<10||password.length>200)return res.status(400).json({error:'아이디 3~40자, 이름, 비밀번호 10~200자를 확인하세요'});
 const permissions=Object.fromEntries(['input','edit','delete','approve','operate'].map(k=>[k,b.permissions?.[k]===true]));const {data,error}=await supabase.from('station_operator_accounts').insert({station_id:ctx.station.id,username,display_name:name,password_hash:await passwordHash(password),permissions}).select('*').single();if(error)throw error;res.json({ok:true,account:publicAccount(data)});
 }));
 app.patch('/api/operators/:id',wrap(async(req,res)=>{const ctx=await getStationContext(req,res);if(!ctx)return;if(!await stationAllowed(req,ctx.station))return res.status(403).json({error:'방송국 관리자 전용'});const {data:old,error:err}=await supabase.from('station_operator_accounts').select('*').eq('station_id',ctx.station.id).eq('id',req.params.id).single();if(err)throw err;
 const updates={session_version:old.session_version+1};if(typeof req.body.enabled==='boolean')updates.enabled=req.body.enabled;if(req.body.permissions)updates.permissions=Object.fromEntries(['input','edit','delete','approve','operate'].map(k=>[k,req.body.permissions[k]===true]));if(req.body.password!==undefined){if(String(req.body.password).length<10||String(req.body.password).length>200)return res.status(400).json({error:'새 비밀번호는 10~200자'});updates.password_hash=await passwordHash(String(req.body.password));}
 const {data,error}=await supabase.from('station_operator_accounts').update(updates).eq('station_id',ctx.station.id).eq('id',old.id).select('*').single();if(error)throw error;res.json({ok:true,account:publicAccount(data)});
 }));
 app.get('/api/operator-me',wrap(async(req,res)=>{const ctx=await getStationContext(req,res);if(!ctx)return;const admin=await stationAllowed(req,ctx.station),actor=req.namedActor;if(!admin&&actor?.stationId!==ctx.station.id)return res.status(401).json({error:'로그인 필요'});res.json({role:admin?'station_admin':'broadcast_manager',name:admin?'방송국 관리자':actor.name,permissions:admin?{input:true,edit:true,delete:true,approve:true,operate:true}:actor.permissions,station:ctx.station.slug});}));
 app.get('/api/operator-audit',wrap(async(req,res)=>{const ctx=await getStationContext(req,res);if(!ctx)return;if(!await stationAllowed(req,ctx.station)&&req.namedActor?.stationId!==ctx.station.id)return res.status(403).json({error:'로그인 필요'});let query=supabase.from('station_operator_audit').select('*').eq('station_id',ctx.station.id).order('created_at',{ascending:false}).limit(100);if(!await stationAllowed(req,ctx.station))query=query.eq('actor_id',req.namedActor.id);const {data,error}=await query;if(error)throw error;res.json({logs:data||[]});}));
 return {loadActor,cookie,passwordHash,passwordMatches,async revoke(req){const raw=parseCookies(req).operator_session;if(!raw||!supabase)return;const {error}=await supabase.from('station_operator_sessions').delete().eq('token_hash',hash(raw));if(error)throw error;}};
};
module.exports.passwordHash=passwordHash;module.exports.passwordMatches=passwordMatches;
