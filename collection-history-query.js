'use strict';
// Quote JSON as a single PostgREST logic-tree value; commas inside JSON are data.
function filterFor(ids){return ids.map(id=>'checks.cs.'+JSON.stringify(JSON.stringify([{meta:true,captureId:id}]))).join(',');}
async function readRelated(supabase,stationId,broadcastId,candidates){
 const rows=[];const ids=[...new Set(candidates.map(c=>String(c.id)))];
 // Bound the URL size rather than putting up to 100 JSON expressions in one GET.
 for(let i=0;i<ids.length;i+=20){const filter=filterFor(ids.slice(i,i+20));
  for(let offset=0;;offset+=1000){const {data,error}=await supabase.from('donations').select('*').eq('station_id',stationId).eq('broadcast_id',broadcastId).or(filter).order('created_at').order('id').range(offset,offset+999);if(error)throw error;rows.push(...(data||[]));if((data||[]).length<1000)break;if(offset>=99000)throw Error('수집 내역 연결 행이 너무 많습니다. 확인이 필요합니다.');}
 }
 return [...new Map(rows.map(r=>[r.id,r])).values()];
}
module.exports={filterFor,readRelated};
