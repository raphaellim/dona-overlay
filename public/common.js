const $=s=>document.querySelector(s);
function esc(v){return String(v??'').replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));}
function toWon(v){const n=Number(String(v??'').replace(/[^0-9.-]/g,''));return Number.isFinite(n)?Math.trunc(n):0;}
function displayMan(won){return Math.trunc(won/1000)/10;}
async function api(url,opt={}){opt.headers={...(opt.headers||{}),'Content-Type':'application/json'};const r=await fetch(url,opt);let j;try{j=await r.json()}catch{j={}};if(!r.ok)throw new Error(j.error||'요청 실패');return j;}
