'use strict';
function presetSelections(settings,body){
 if(body.presetSelections===undefined)return null;
 if(!Array.isArray(body.presetSelections)||body.presetSelections.length>20)throw Error('프리셋 선택 확인 필요');
 const seen=new Set();return body.presetSelections.map(x=>{const p=(settings.presets||[]).find(p=>p.id===x.presetId&&p.enabled!==false);if(!p||!['plus','minus'].includes(x.side)||seen.has(p.id))throw Error('활성 프리셋과 한쪽 항목만 선택하세요');seen.add(p.id);const price=Number(x.side==='minus'?p.minusPrice:p.plusPrice);if(!Number.isSafeInteger(price)||price<=0)throw Error('프리셋 단가를 설정하세요');return {presetId:p.id,side:x.side};});
}
function applyPresets(row,selections,amount,settings,calcCheck){
 if(selections===null)return row;
 const result={...row,smoke:0,nosmoke:0,eat:0,noeat:0,checks:(row.checks||[]).filter(c=>c.meta),result_label:'후원'};const labels=[];
 for(const x of selections){const r=calcCheck(x.presetId+':'+x.side,amount,settings);for(const k of ['smoke','nosmoke','eat','noeat'])result[k]+=r[k]||0;result.checks.push(...r.checks);labels.push(r.label);}
 if(labels.length)result.result_label=labels.join(' · ');return result;
}
module.exports={presetSelections,applyPresets};
