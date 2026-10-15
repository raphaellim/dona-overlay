'use strict';
module.exports=d=>async(req,res,next)=>{try{
 const {supabase,getStationContext,stationAllowed,isMasterRequest}=d;
 if(!req.path.startsWith('/api/'))return next();
 if(!['POST','PUT','PATCH','DELETE'].includes(req.method))return next();
 if(req.headers.origin){try{if(new URL(req.headers.origin).host!==req.headers.host)return res.status(403).json({error:'다른 사이트에서의 변경 요청 차단'});}catch{return res.status(403).json({error:'Origin 오류'});}}
 const tracked=/^\/api\/(donations(?:\/|$)|manual-entry(?:\/|$)|collection-candidates|(?:account|toonie)-candidates\/|settings(?:\/|$)|mission-timer|roulette|operators|broadcasts|station\/collection-rules|alert-config|overlay-display)/.test(req.path);
 if(!tracked)return next();
 const ctx=await getStationContext(req,res);if(!ctx)return;const admin=await stationAllowed(req,ctx.station),actor=req.namedActor;
 if(!admin){if(!actor||actor.stationId!==ctx.station.id)return res.status(403).json({error:'해당 방송국 로그인 필요'});
 let permission=null;
 if(req.path==='/api/manual-entry')permission='input';
 else if(/^\/api\/donations/.test(req.path))permission=req.method==='DELETE'?'delete':req.method==='PUT'||req.method==='PATCH'?'edit':'input';
 else if(/\/approve$/.test(req.path))permission='approve';else if(/\/edit$/.test(req.path))permission='edit';else if(/\/dismiss$/.test(req.path))permission='delete';else if(/^\/api\/(mission-timer|roulette)/.test(req.path))permission='operate';
 if(!permission||!actor.permissions[permission])return res.status(403).json({error:'이 작업 권한이 없습니다.'});
 }
 // Reserve an audit row before a mutation; if unavailable, do not perform the mutation.
 const clean=value=>{if(!value||typeof value!=='object')return value;const out={};for(const [k,v]of Object.entries(value)){if(/password|token|secret|cookie|authorization/i.test(k))continue;out[k]=Array.isArray(v)?v.map(clean):v&&typeof v==='object'?clean(v):v;}return out;};
 let before=null;const candidate=req.path.match(/^\/api\/(?:collection|account|toonie)-candidates\/([a-f0-9-]+)\//i);if(candidate){const r=await supabase.from('donation_capture_candidates').select('*').eq('station_id',ctx.station.id).eq('id',candidate[1]).maybeSingle();if(r.error)throw r.error;before=clean(r.data);}const match=req.path.match(/^\/api\/donations\/([a-f0-9-]+)$/i);if(match){const r=await supabase.from('donations').select('*').eq('station_id',ctx.station.id).eq('id',match[1]).maybeSingle();if(r.error)throw r.error;before=clean(r.data);if(!admin&&r.data&&r.data.broadcast_id!==ctx.active.id)return res.status(403).json({error:'매니저는 현재 방송만 수정할 수 있습니다.'});}
 const {data:log,error}=await supabase.from('station_operator_audit').insert({station_id:ctx.station.id,broadcast_id:ctx.active.id,actor_id:actor?.id||null,actor_name:admin?(isMasterRequest(req)?'최고관리자':'방송국 관리자'):actor.name,action:req.method+' '+req.path,before_data:before}).select('id').single();if(error)throw error;
 const json=res.json.bind(res);res.json=function(body){res.json=json;const status=res.statusCode;const safe=clean(body);supabase.from('station_operator_audit').update({status:status>=200&&status<300&&!body?.error?'success':'failed',after_data:safe}).eq('id',log.id).then(({error})=>{if(error){console.error('작업 로그 결과 기록 실패:',log.id);if(body&&typeof body==='object')body.auditWarning='작업 결과는 저장됐지만 로그 결과 기록 실패. 재입력하지 말고 확인하세요.';}json(body);}).catch(()=>json({...body,auditWarning:'로그 결과 기록 확인 필요'}));return res;};
 next();
 }catch(e){res.status(503).json({error:'작업 로그/권한 확인 실패: '+e.message});}};
