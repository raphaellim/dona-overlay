'use strict';
// Display only: never changes identities, original captures, allocation or preset calculation.
const {matcher,resolver}=require('./donor-identity');
function split(entries,payload){const {originalDonor,...safe}=payload;if(payload.source!=='account')return safe;
 const raw=String(originalDonor??payload.donor??'').normalize('NFC').trim(),hit=matcher(entries)(raw),display=resolver(entries)(payload.donor);
 const result={...safe,donor:display,donorDisplayResolved:true};
 if(!hit.nickname||hit.nickname!==display||!raw.includes(hit.nickname))return result;
 const at=raw.indexOf(hit.nickname),rest=(raw.slice(0,at)+raw.slice(at+hit.nickname.length)).replace(/^[\s|/,:;·_\-]+|[\s|/,:;·_\-]+$/g,'').trim();
 if(!rest)return result;const existing=String(payload.message||'').trim();result.message=(existing===rest?rest:[rest,existing].filter(Boolean).join('\n')).slice(0,2000);return result;
}
module.exports={split};
