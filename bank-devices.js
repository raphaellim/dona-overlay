'use strict';
const crypto=require('crypto');
module.exports=function mountBankDevices(app,{supabase,getStation,getStationContext,stationAllowed,isMasterRequest,saveAccount,changed=()=>{}}){
 const hash=t=>crypto.createHash('sha256').update(t).digest('hex');
 const budget=new Map();
 function limited(key,max){const now=Date.now();for(const [k,v]of budget)if(v.until<now)budget.delete(k);if(budget.size>=1000&&!budget.has(key))return true;const v=budget.get(key)||{n:0,until:now+600000};v.n++;budget.set(key,v);return v.n>max;}
 const admin=async(req,res)=>{const ctx=await getStationContext(req,res);if(!ctx)return null;
 if(!(isMasterRequest(req)||(ctx.station.station_admin_password&&await stationAllowed(req,ctx.station)))){res.status(403).json({error:'방송국 관리자 로그인 필요 · 관리자 비밀번호를 먼저 설정하세요.'});return null;}return ctx;};
 function originOK(req,res){try{if(new URL(req.headers.origin).host===req.get('host'))return true;}catch{}res.status(403).json({error:'관리자 웹페이지에서 요청하세요.'});return false;}
 async function device(req){const token=String(req.headers['x-bank-device-token']||'');if(token.length<32||token.length>200)return null;const {data,error}=await supabase.from('station_bank_devices').select('*').eq('token_hash',hash(token)).maybeSingle();if(error)throw error;return data;}
 const banks=b=>({kbank:String(b?.kbank||'').slice(0,200),kakao:String(b?.kakao||'').slice(0,200),woori:String(b?.woori||'').slice(0,200)});
 app.post('/api/bank-devices/pair',async(req,res)=>{try{
 if(limited('pair:'+req.ip,12))return res.status(429).json({error:'연결 요청이 많습니다. 잠시 후 다시 시도하세요.'});
 const token=String(req.body?.deviceToken||'');if(!/^[a-f0-9]{64}$/.test(token))return res.status(400).json({error:'기기 연결키 형식 오류'});
 const code=crypto.randomBytes(5).toString('hex').toUpperCase(),expires=new Date(Date.now()+600000).toISOString();
 const {error}=await supabase.from('station_bank_devices').insert({token_hash:hash(token),pair_code:code,pair_expires_at:expires,device_name:String(req.body?.deviceName||'Android').slice(0,100)});if(error)throw error;
 res.set('Cache-Control','no-store');res.json({code,expiresAt:expires});
 }catch(e){res.status(500).json({error:e.message});}});
 app.post('/api/bank-devices/sync',async(req,res)=>{try{const d=await device(req);if(!d)return res.status(401).json({error:'기기 연결 정보 없음'});
 if(d.state==='revoked')return res.status(403).json({error:'관리자가 기기 연결을 해제했습니다.'});
 if(d.state==='pending'){if(Date.parse(d.pair_expires_at)<Date.now())return res.status(410).json({error:'연결 코드 만료 · 앱에서 다시 연결하세요.'});return res.json({state:'pending'});}
 const {data:st,error:stError}=await supabase.from('stations').select('slug').eq('id',d.station_id).maybeSingle();if(stError)throw stError;if(!st)return res.status(409).json({error:'방송국 없음'});
 const {error}=await supabase.from('station_bank_devices').update({last_seen_at:new Date().toISOString(),banks:req.body?.banks?banks(req.body.banks):d.banks,listener_status:req.body?.listener===undefined?d.listener_status:String(req.body.listener).slice(0,100),last_result:req.body?.result===undefined?d.last_result:String(req.body.result).slice(0,200)}).eq('id',d.id).eq('state','linked');if(error)throw error;
 res.set('Cache-Control','no-store');res.json({state:'linked',station:st.slug,creator:d.creator,enabled:d.enabled,deviceName:d.device_name});
 }catch(e){res.status(500).json({error:e.message});}});
 app.get('/api/station/bank-devices',async(req,res)=>{try{const ctx=await admin(req,res);if(!ctx)return;res.set('Cache-Control','no-store');const {data,error}=await supabase.from('station_bank_devices').select('id,device_name,state,enabled,creator,banks,listener_status,last_result,last_seen_at,created_at').eq('station_id',ctx.station.id).order('created_at',{ascending:false});if(error)throw error;res.json({devices:data||[]});}catch(e){res.status(500).json({error:e.message});}});
 app.post('/api/station/bank-devices/claim',async(req,res)=>{try{if(!originOK(req,res))return;const ctx=await admin(req,res);if(!ctx)return;if(limited('claim:'+ctx.station.id,20))return res.status(429).json({error:'연결 코드 요청이 많습니다. 잠시 후 재시도하세요.'});const code=String(req.body?.code||'').replace(/[^A-Za-z0-9]/g,'').toUpperCase();if(code.length!==10)return res.status(400).json({error:'앱에 표시된 10자리 연결 코드를 입력하세요.'});
 const {data,error}=await supabase.from('station_bank_devices').update({station_id:ctx.station.id,state:'linked',pair_code:null,enabled:false,creator:String(req.body?.creator||'').slice(0,100)}).eq('pair_code',code).eq('state','pending').gt('pair_expires_at',new Date().toISOString()).select('id,device_name').maybeSingle();if(error)throw error;if(!data)return res.status(404).json({error:'코드가 없거나 만료되었거나 이미 연결됐습니다.'});changed();res.json({ok:true,device:data});
 }catch(e){res.status(500).json({error:e.message});}});
 app.post('/api/station/bank-devices/:id',async(req,res)=>{try{if(!originOK(req,res))return;const ctx=await admin(req,res);if(!ctx)return;const b=req.body||{},values=b.revoke===true?{state:'revoked',enabled:false}:{device_name:String(b.deviceName||'Android').slice(0,100),creator:String(b.creator||'').slice(0,100),enabled:b.enabled===true};
 const {data,error}=await supabase.from('station_bank_devices').update(values).eq('id',req.params.id).eq('station_id',ctx.station.id).eq('state','linked').select('id').maybeSingle();if(error)throw error;if(!data)return res.status(409).json({error:'연결된 기기를 찾을 수 없습니다.'});changed();res.json({ok:true});
 }catch(e){res.status(500).json({error:e.message});}});
 app.post('/api/bank-device-candidates',async(req,res)=>{try{const d=await device(req);if(!d||d.state!=='linked')return res.status(401).json({error:'관리자가 연결한 기기만 전송 가능합니다.'});if(!d.enabled)return res.status(403).json({error:'관리자가 수집을 중지했습니다.'});
 const {data:station,error}=await supabase.from('stations').select('id,slug').eq('id',d.station_id).maybeSingle();if(error)throw error;if(!station)return res.status(409).json({error:'방송국 없음'});
 const b=req.body||{};if(b.station!==station.slug)return res.status(409).json({error:'이 내역은 다른 방송국에서 수집됐습니다. 자동 전송하지 않습니다.'});
 res.json(await saveAccount({...b,creator:d.creator},station));
 }catch(e){res.status(500).json({error:e.message});}});
};
