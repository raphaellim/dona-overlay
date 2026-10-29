const crypto=require('crypto');
function validWidgetUrl(value) {
  try {
    const u = new URL(String(value || '').trim());
    return u.protocol === 'https:' && u.hostname === 'toon.at' && /^\/widget\/alertbox\/[a-zA-Z0-9]+\/?$/.test(u.pathname)
      ? u.href : '';
  } catch { return ''; }
}


function parsePacket(payload){
 let event;try{event=JSON.parse(String(payload));}catch{return null;}
 const c=event?.content;if(!c||typeof c!=='object')return null;
 const donor=String(c.name||'익명의 후원자').trim()||'익명의 후원자',title=String(c.title_info?.name||'').trim(),amount=Number(c.amount),message=String(c.message||'');
 if(/테스트/i.test(donor+' '+title+' '+message)||!Number.isSafeInteger(amount)||amount<=0||amount>1e9)return null;
 const fields=[String(event.time??''),donor,String(amount),message,String(c.title_info?.name??'')];const playbackKey=crypto.createHash('sha256').update(fields.map(x=>Buffer.from(x).toString('base64')).join('|')).digest('hex');
 return {playbackKey,donor,title,amount,message,replay:Number(event.replay||0)!==0};
}
module.exports={validWidgetUrl,parsePacket};
