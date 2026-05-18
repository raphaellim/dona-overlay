const $=s=>document.querySelector(s);
function esc(v){return String(v??'').replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));}
function toWon(v){
  const raw = String(v ?? '').trim().replace(/,/g,'');
  if(!raw) return 0;
  const n = Number(raw.replace(/[^0-9.-]/g,''));
  if(!Number.isFinite(n)) return 0;
  if(Math.abs(n) > 0 && Math.abs(n) < 1000) return Math.round(n * 1000);
  return Math.trunc(n);
}
function displayMan(won){return Math.trunc(won/1000)/10;}
async function api(url,opt={}){opt.headers={...(opt.headers||{}),'Content-Type':'application/json'};const r=await fetch(url,opt);let j;try{j=await r.json()}catch{j={}};if(!r.ok)throw new Error(j.error||'요청 실패');return j;}
