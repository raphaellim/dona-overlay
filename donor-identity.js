'use strict';
const normalize=v=>String(v??'').normalize('NFC').trim();
function clean(entries){if(!Array.isArray(entries)||entries.length>5000)throw Error('등록은 최대 5,000개입니다.');const seen=new Set();return entries.map(e=>{const source=normalize(e.source),nickname=normalize(e.nickname);if(!source||!nickname||source.length>40||Array.from(nickname).length>12||/[\r\n\x00-\x1f]/.test(source+nickname))throw Error('입금자명과 닉네임을 확인하세요. 닉네임은 12글자까지입니다.');if(seen.has(source))throw Error('같은 입금자명이 중복되었습니다.');seen.add(source);return {source,nickname};});}
function matcher(entries){
 const exact=new Map(entries.map(e=>[normalize(e.source),normalize(e.nickname)]));
 const prefixes=[...exact].sort((a,b)=>b[0].length-a[0].length);
 const registered=[...new Set(entries.map(e=>normalize(e.nickname)))];
 return value=>{const raw=normalize(value);if(exact.has(raw))return {nickname:exact.get(raw),kind:'alias'};
 const prefix=prefixes.find(([source])=>raw.startsWith(source));
 if(prefix)return {nickname:prefix[1],kind:'alias-prefix',message:raw.slice(prefix[0].length).trim(),source:prefix[0]};
 if(registered.includes(raw))return {nickname:raw,kind:'exact'};
 const matches=registered.filter(n=>Array.from(n).length>=2&&raw.includes(n));
 const best=matches.filter(n=>!matches.some(other=>other!==n&&other.includes(n)));
 return best.length===1?{nickname:best[0],kind:'contains'}:best.length?{ambiguous:true,candidates:best}:{nickname:null};};
}
function resolver(entries){const match=matcher(entries);return value=>{const raw=normalize(value)||'익명',hit=match(raw);if(hit.nickname)return hit.nickname;const chars=Array.from(raw);if(chars.length>1)chars[1]='＊';return chars.join('');};}
function create({supabase,withSettingsMutation}){
 async function store(){const {data,error}=await supabase.from('settings').select('data').eq('id',3).maybeSingle();if(error&&error.code!=='PGRST116')throw error;return data?.data||{};}
 async function list(slug){const s=await store();return s.$donorIdentity?.[slug]||[];}
 async function save(slug,entries){const valid=clean(entries);return withSettingsMutation(async()=>{const s=await store();s.$donorIdentity={...s.$donorIdentity,[slug]:valid};const {error}=await supabase.from('settings').upsert({id:3,data:s,updated_at:new Date().toISOString()},{onConflict:'id'});if(error)throw error;return valid;});}
 async function match(slug,value){return matcher(await list(slug))(value);}
 async function register(slug,source,nickname){source=normalize(source);nickname=normalize(nickname);return withSettingsMutation(async()=>{const s=await store(),entries=s.$donorIdentity?.[slug]||[];const old=entries.find(e=>e.source===source);if(old&&old.nickname!==nickname)throw Error('이 입금자명은 다른 닉네임에 연결되어 있습니다. 닉네임 관리에서 수정하세요.');const valid=clean([...entries.filter(e=>e.source!==source),{source,nickname}]);s.$donorIdentity={...s.$donorIdentity,[slug]:valid};const {error}=await supabase.from('settings').upsert({id:3,data:s,updated_at:new Date().toISOString()},{onConflict:'id'});if(error)throw error;return valid;});}
 async function names(slug){return resolver(await list(slug));}
 async function canonicalRows(slug,rows){const match=matcher(await list(slug));return rows.map(r=>{const raw=r.donor??r.donor_name;return {...r,donor:match(raw).nickname||raw};});}
 async function summaryRows(slug,rows){const match=matcher(await list(slug));return rows.map(r=>{if(Number(r.accountAmount??r.account_amount??0)<=0)return {...r};const hit=match(r.donor);return hit.nickname?{...r,originalDonor:r.originalDonor??r.donor,donor:hit.nickname}:{...r};});}
 async function accountRows(slug,rows){const name=await names(slug);return rows.map(r=>({...r,donor:name(r.donor??r.donor_name)}));}
 async function state(slug,input){const name=await names(slug);const output=structuredClone(input);function visit(v,key=''){if(Array.isArray(v)){for(const r of v)visit(r,key);return;}if(!v||typeof v!=='object')return;if(typeof v.donor==='string'&&(key==='accountDonors'||Number(v.accountAmount??v.account_amount??v.account)>0)){v.donor=name(v.donor);v.donorDisplayResolved=true;}for(const [k,x]of Object.entries(v))if(x&&typeof x==='object')visit(x,k);}visit(output);return output;}
 return {list,save,names,match,register,canonicalRows,summaryRows,accountRows,state};
}
module.exports={create,clean,resolver,matcher};
