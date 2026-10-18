'use strict';
const tokens=s=>String(s||'').normalize('NFKC');
function has(text,word){if(!word)return false;if([...word].length===1)return text.split(/[\s,.:;!?()[\]{}\/|+\-_]+/u).includes(word);return text.includes(word);}
function preset(settings,amount,text){
 const candidates=[];for(const p of settings.presets||[]){if(p.enabled===false)continue;for(const side of ['plus','minus']){const price=Number(p[side+'Price']);if(!Number.isSafeInteger(price)||price<=0)continue;const name=String(p[side+'Name']||'');const words=[name];if(p.id==='smoke'||/흡연|금연/.test(name)){if(/금연/.test(name))words.push('금');else if(/흡연/.test(name))words.push('흡');}candidates.push({presetId:p.id,side,price,name,keyword:words.some(w=>has(tokens(text),w))});}}
 let matches=candidates.filter(c=>c.keyword),keyword=matches.length>0;if(!keyword){matches=candidates.filter(c=>amount>0&&amount%c.price===0&&amount/c.price<=10);const exact=matches.filter(c=>amount===c.price);if(exact.length)matches=exact;}
 if(matches.length>1)return {error:'프리셋 후보가 여러 개입니다: '+matches.map(c=>c.name).join(', ')+' · 항목을 직접 선택하세요'};
 if(!matches.length)return {selections:null};const m=matches[0];if(amount<m.price)return {error:m.name+' 단가보다 후원 금액이 작습니다 · 직접 확인하세요'};
 return {selections:[{presetId:m.presetId,side:m.side}],count:Math.floor(amount/m.price),name:m.name,keyword};
}
function funding(settings,donor){const name=tokens(donor).trim();const m=name.match(/^(.*?)\s+펀딩$|^펀딩\s+(.+)$/u);if(!m)return null;const clean=(m[1]||m[2]||'').trim();if(!clean)return {error:'펀딩 후원자명을 확인하세요'};const active=(settings.fundingData?.items||[]).filter(f=>f.enabled!==false);if(active.length!==1)return {donor:clean,error:active.length?'활성 펀딩이 여러 개입니다 · 펀딩 대상을 선택하세요':'활성 펀딩이 없습니다 · 펀딩을 설정하세요'};return {donor:clean,fundingId:active[0].id,fundingExactWon:true};}
function resolve(settings,amount,text,donor){const f=funding(settings,donor);if(f)return {funding:f};return {preset:preset(settings,amount,text)};}
function checkBySource(settings,account,toonie,text,calcCheck){const result={smoke:0,nosmoke:0,eat:0,noeat:0,checks:[],label:'후원'},labels=[];for(const [paymentSource,amount] of [['account',account],['toonie',toonie]]){if(!amount)continue;const decision=preset(settings,amount,text);if(decision.error)throw Error(decision.error);if(!decision.selections)continue;const chosen=decision.selections[0],value=calcCheck(chosen.presetId+':'+chosen.side,amount,settings);for(const key of ['smoke','nosmoke','eat','noeat'])result[key]+=Number(value[key]||0);result.checks.push(...value.checks.map(c=>({...c,autoPreset:true,paymentSource})));labels.push(value.label);}if(labels.length)result.label=labels.join(' · ');return result;}
module.exports={preset,funding,resolve,checkBySource};
