'use strict';
function normalizeConfig(c){
 const targets=(Array.isArray(c?.targets)?c.targets:[]).map(t=>({id:String(t.id||require('crypto').createHash('sha256').update(String(t.name||'').trim()).digest('hex').slice(0,24)),name:String(t.name||'').trim().slice(0,100),group:t.group==='other'?'other':'streamer',active:t.active!==false,aliases:(Array.isArray(t.aliases)?t.aliases:String(t.aliases||'').split(',')).map(x=>String(x).trim()).filter(Boolean)})).filter(t=>t.name);
 if(targets.length>50||new Set(targets.map(t=>t.name)).size!==targets.length||new Set(targets.map(t=>t.id)).size!==targets.length||targets.some(t=>!/^[-A-Za-z0-9_]{1,64}$/.test(t.id)))throw Error('대상 이름 중복 또는 50명 초과');
 return {mode:c?.mode==='solo'?'solo':'collab',targets};
}
function classify(row,config){
 const c=normalizeConfig(config),streamers=c.targets.filter(t=>t.active&&t.group==='streamer'),active=c.targets.filter(t=>t.active);
 const hold=reason=>({state:'hold',reason,donor:row.donor,rows:[]});
 const validate=(donor,rows)=>{const sum=rows.reduce((n,r)=>n+r.amount,0);return {state:sum===Number(row.amount)?(c.mode==='solo'&&streamers.length===1&&rows.length===1&&rows[0].creator===streamers[0].name?'auto':'review'):'hold',reason:sum===Number(row.amount)?'확인 승인 필요':`총액 ${row.amount}원 · 분배 ${sum}원 · 차액 ${Number(row.amount)-sum}원`,donor,rows};};
 if(row.replay)return hold('재생 알림 · 실제 신규 후원인지 확인 필요');
 const text=String(row.donor||'')+' '+String(row.message||'');
 const matches=[];
 for(const t of active)for(const alias of new Set([t.name,...t.aliases])){
   let from=0,at;while((at=text.indexOf(alias,from))!==-1){from=at+alias.length;
     // A recipient must be a separate word, punctuation-separated, or follow Korean donor particles.
     if(at>0&&!/[\s/,，]/.test(text[at-1])&&!/님이$|님께서$|가$|이$/.test(text.slice(0,at)))continue;
     const after=text.slice(at+alias.length);if(after&&!/^(?:에게|한테|께|[\s/,，\d.]|$)/.test(after))continue;
     const n=/^(?:에게|한테|께)?\s*(\d+(?:\.\d+)?)\s*(만원|만|원)?/.exec(after);
     matches.push({t,at,end:at+alias.length+(n?n[0].length:0),length:alias.length,amount:n?Math.round(Number(n[1])*(n[2]==='원'?1:10000)):null});
   }
 }
 matches.sort((a,b)=>a.at-b.at||b.length-a.length);const selected=[];
 for(const m of matches){const prior=selected.find(x=>m.at<x.end&&m.end>x.at);if(prior){if(prior.t.name!==m.t.name&&prior.at===m.at&&prior.length===m.length)return hold('동일 별칭이 여러 대상에 등록됨');continue;}selected.push(m);}
 let donor=row.donor;if(selected.length){const before=text.slice(0,selected[0].at).trim().replace(/[\s/,，]+$/,'').replace(/(?:님께서|님이|님|가|이)\s*$/,'').trim();if((row.source==='account'||selected[0].at<String(row.donor||'').length)&&before)donor=before;}
 if(c.mode==='solo'){
   if(streamers.length!==1)return hold('단독 모드는 활성 방송인이 정확히 1명이어야 합니다');
   if(!selected.length&&/(?:에게|한테)|\s+[^\s]+\d/.test(text))return hold('대상 지정으로 보이는 문구 · 수동 확인 필요');
   if(!selected.length)return {state:'auto',reason:'단독방송 자동 반영',donor,rows:[{targetId:streamers[0].id,creator:streamers[0].name,amount:Number(row.amount)}]};
 }
 if(/균등|각\s*\d/.test(text)){
   if(!streamers.length)return hold('균등 분배할 방송인 없음');
   if(row.source==='account'&&!selected.length){const prefix=String(row.donor||'').split(/균등|각\s*\d/)[0].trim().replace(/\s+\d+(?:\.\d+)?\s*(?:만원|만|원)?$/,'').replace(/(?:님께서|님이|가)\s*$/,'').trim();if(prefix)donor=prefix;}
   if(selected.some(m=>m.t.group==='other'))return hold('균등 분배와 방송인 외 지정이 함께 있음 · 수동 확인');
   const each=/각\s*(\d+(?:\.\d+)?)\s*(만원|만|원)?/.exec(text);
   const amount=each?Math.round(Number(each[1])*(each[2]==='원'?1:10000)):Number(row.amount)/streamers.length;
   if(!Number.isSafeInteger(amount)||amount<=0)return hold('원 단위 균등 분배 불가');
   return validate(donor,streamers.map(t=>({targetId:t.id,creator:t.name,amount})));
 }
 if(!selected.length)return hold('후원 대상 미지정');
 if(new Set(selected.map(m=>m.t.name)).size!==selected.length)return hold('같은 대상이 반복 지정됨');
 if(selected.length===1&&selected[0].amount===null)return validate(donor,[{targetId:selected[0].t.id,creator:selected[0].t.name,amount:Number(row.amount)}]);
 if(selected.some(m=>m.amount===null||!Number.isSafeInteger(m.amount)||m.amount<=0))return hold('분배 금액 확인 필요');
 return validate(donor,selected.map(m=>({targetId:m.t.id,creator:m.t.name,amount:m.amount})));
}
module.exports={normalizeConfig,classify};
