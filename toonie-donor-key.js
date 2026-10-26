'use strict';
// Only an explicitly supplied stable donor identifier qualifies. Event/capture IDs are never donor IDs.
const crypto=require('crypto');module.exports=value=>{if(typeof value!=='string'&&!(typeof value==='number'&&Number.isSafeInteger(value)))return '';const s=String(value).normalize('NFC').trim();if(!s||s.length>128||/[\x00-\x1f\x7f]/.test(s))return '';return /^td:[a-f0-9]{64}$/.test(s)?s:'td:'+crypto.createHash('sha256').update(s).digest('hex');};
