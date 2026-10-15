'use strict';
const normalize=v=>String(v??'').normalize('NFC').trim();
function clean(entries){if(!Array.isArray(entries)||entries.length>500)throw Error('등록은 최대 500개입니다.');const seen=new Set();return entries.map(e=>{const source=normalize(e.source),nickname=normalize(e.nickname);if(!source||!nickname||source.length>40||Array.from(nickname).length>12||/[\r\n\x00-\x1f]/.test(source+nickname))throw Error('입금자명과 닉네임을 확인하세요. 닉네임은 12글자까지입니다.');if(seen.has(source))throw Error('같은 입금자명이 중복되었습니다.');seen.add(source);return {source,nickname};});}
function resolver(entries){const map=new Map(entries.map(e=>[e.source,e.nickname])),registered=new Set(entries.map(e=>e.nickname));return value=>{const raw=normalize(value)||'익명';if(map.has(raw))return map.get(raw);if(registered.has(raw))return raw;const chars=Array.from(raw);if(chars.length>1)chars[1]='♥';return chars.join('');};}
function create({supabase,withSettingsMutation}){
 async function store(){const {data,error}=await supabase.from('settings').select('data').eq('id',3).maybeSingle();if(error&&error.code!=='PGRST116')throw error;return data?.data||{};}
 async function list(slug){const s=await store();return s.$donorIdentity?.[slug]||[];}
 async function save(slug,entries){const valid=clean(entries);return withSettingsMutation(async()=>{const s=await store();s.$donorIdentity={...s.$donorIdentity,[slug]:valid};const {error}=await supabase.from('settings').upsert({id:3,data:s,updated_at:new Date().toISOString()},{onConflict:'id'});if(error)throw error;return valid;});}
 async function names(slug){return resolver(await list(slug));}
 async function accountRows(slug,rows){const name=await names(slug);return rows.map(r=>({...r,donor:name(r.donor??r.donor_name)}));}
 async function state(slug,input){const name=await names(slug);const output=structuredClone(input);function visit(v,key=''){if(Array.isArray(v)){for(const r of v)visit(r,key);return;}if(!v||typeof v!=='object')return;if(typeof v.donor==='string'&&(key==='accountDonors'||Number(v.accountAmount??v.account_amount??v.account)>0)){v.donor=name(v.donor);v.donorDisplayResolved=true;}for(const [k,x]of Object.entries(v))if(x&&typeof x==='object')visit(x,k);}visit(output);return output;}
 return {list,save,names,accountRows,state};
}
module.exports={create,clean,resolver};
