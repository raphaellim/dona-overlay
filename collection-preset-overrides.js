'use strict';
// Explicit corrections replace calculated counts; no donation amounts are changed.
module.exports=function(row,overrides,settings){
 if(overrides===undefined)return row;
 if(!Array.isArray(overrides)||overrides.length>100)throw Error('프리셋 횟수 수정 항목을 확인하세요');
 const own=overrides.filter(x=>x.creator===row.creator),seen=new Set();
 for(const x of own){const p=(settings.presets||[]).find(p=>p.id===x.presetId&&p.enabled!==false);if(!p||!['plus','minus'].includes(x.side)||!Number.isSafeInteger(x.count)||x.count<0||x.count>10000||seen.has(x.presetId))throw Error('프리셋 종류·횟수를 확인하세요');seen.add(x.presetId);row.checks=row.checks.filter(c=>c.meta||c.presetId!==x.presetId);if(x.count){const price=Number(p[x.side+'Price']||0);row.checks.push({presetId:p.id,presetTitle:p.title,side:x.side,name:p[x.side+'Name'],price,count:x.count,usedAmount:x.count*price,remainAmount:Math.max(0,row.total_amount-x.count*price),manualCorrection:true});}}
 row.smoke=0;row.nosmoke=0;row.eat=0;row.noeat=0;
 for(const c of row.checks){if(c.presetId==='smoke')row[c.side==='plus'?'smoke':'nosmoke']+=c.count;if(c.presetId==='food')row[c.side==='plus'?'eat':'noeat']+=c.count;}
 row.result_label=row.checks.filter(c=>!c.meta&&c.presetId).map(c=>c.name+(c.side==='minus'?'-':'+')+c.count).join(' · ')||'후원';return row;
};
