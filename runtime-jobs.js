'use strict';
const crypto=require('crypto');
module.exports=function({supabase,runChat,onWake}){
 let stopped=false,running=false,timer=null;const owner='worker:'+crypto.randomUUID();
 async function put(kind,station,broadcast,key,payload){const {error}=await supabase.from('overlay_runtime_jobs').upsert({kind,station,broadcast:String(broadcast||''),event_key:String(key).slice(0,240),payload},{onConflict:'station,kind,event_key',ignoreDuplicates:true});if(error)throw error;if(kind==='chat')wake();else onWake?.(station);}
 async function tick(){if(stopped||running)return;running=true;let worked=false;try{for(let n=0;n<10&&!stopped;n++){
 const {data,error}=await supabase.rpc('overlay_claim_job',{p_kind:'chat',p_station:'',p_owner:owner,p_broadcast:''});if(error)throw error;if(!data?.id)break;worked=true;
 let beat,limit;const controller=new AbortController();try{limit=setTimeout(()=>controller.abort(),180000);beat=setInterval(()=>supabase.rpc('overlay_touch_job',{p_id:data.id,p_station:data.station,p_owner:owner,p_action:'heartbeat'}).then(({error,data})=>{if(error||!data)controller.abort();}).catch(()=>controller.abort()),15000);beat.unref?.();const started=await supabase.rpc('overlay_touch_job',{p_id:data.id,p_station:data.station,p_owner:owner,p_action:'start'});if(started.error||!started.data)throw Error('작업 소유권 확인 실패');await runChat(data.payload,controller.signal);const result=await supabase.rpc('overlay_touch_job',{p_id:data.id,p_station:data.station,p_owner:owner,p_action:'done'});if(result.error)throw result.error;}catch(e){await supabase.from('overlay_runtime_jobs').update({status:'failed',finished_at:new Date().toISOString(),owner:null,lease_until:null,available_at:new Date(Date.now()+Math.min(60000,5000*2**data.attempts)).toISOString(),error:String(e.message).slice(0,300)}).eq('id',data.id).eq('owner',owner);}finally{clearInterval(beat);clearTimeout(limit);}
 }}catch(e){console.error('[runtime jobs]',e.message);}finally{running=false;if(!stopped){clearTimeout(timer);timer=setTimeout(tick,worked?100:15000);timer.unref?.();}}}
 function wake(){if(stopped||running)return;clearTimeout(timer);timer=setTimeout(tick,10);timer.unref?.();}
 let cleanup=setInterval(()=>Promise.all([supabase.rpc('overlay_prune_jobs'),supabase.rpc('overlay_prune_receipts')]).then(results=>{for(const {error} of results)if(error)console.error('[job cleanup]',error.message);}).catch(e=>console.error('[job cleanup]',e.message)),3600000);cleanup.unref?.();wake();
 return {put,close(){stopped=true;clearTimeout(timer);clearInterval(cleanup);}};
};
