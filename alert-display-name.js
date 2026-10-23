'use strict';
const {matcher,resolver}=require('./donor-identity');
function split(entries,payload){const {originalDonor,...safe}=payload;if(payload.source!=='account')return safe;
 const raw=String(originalDonor??payload.donor??'').normalize('NFC').trim(),hit=matcher(entries)(raw),display=resolver(entries)(payload.donor);
 const result={...safe,donor:display,donorDisplayResolved:true};
 if(!hit.nickname||hit.nickname!==display)return result;
 const matched=hit.matchedText||(raw===hit.nickname?hit.nickname:'');if(!matched)return result;
 const at=raw.indexOf(matched);if(at<0)return result;
 const rest=hit.kind==='prefix'?hit.message:(raw.slice(0,at)+raw.slice(at+matched.length)).replace(/펀딩/gu,' ').replace(/^[\s|/,:;·_\-]+|[\s|/,:;·_\-]+$/g,'').trim();
 if(!rest)return result;const existing=String(payload.message||'').trim();result.message=(existing===rest?rest:[rest,existing].filter(Boolean).join('\n')).slice(0,2000);return result;
}
module.exports={split};
