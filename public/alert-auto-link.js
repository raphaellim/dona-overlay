(function(root){'use strict';
function identify(file){const name=String(file.originalName||file.name||'');const m=name.match(/^\s*(\d{1,3}(?:,\d{3})+|\d+)(?:원)?[\s_.-]*(.*?)\.(png|jpe?g|webp|gif|mp3|wav|ogg)$/i);if(!m)return null;const amount=Number(m[1].replace(/,/g,''));if(!Number.isSafeInteger(amount)||amount<1000||amount>1e9)return null;return {amount,title:m[2]||amount.toLocaleString()+'원',type:/^(mp3|wav|ogg)$/i.test(m[3])?'sound':'image',file};}
function plan(rules,files,create){const byAmount=new Map();for(const f of files){const p=identify(f);if(!p)continue;if(!byAmount.has(p.amount))byAmount.set(p.amount,{amount:p.amount,title:p.title,image:[],sound:[]});const g=byAmount.get(p.amount);if(!g[p.type].some(x=>x.url===f.url))g[p.type].push(f);}
 const rows=[];for(const r of rules){const g=byAmount.get(Number(r.min));if(g)rows.push({...g,rule:r});}if(create)for(const g of byAmount.values())if(!rules.some(r=>Number(r.min)===g.amount))rows.push({...g,rule:null});return rows.sort((a,b)=>a.amount-b.amount);}
const api={identify,plan};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.AlertAutoLink=api;
})(typeof window==='undefined'?globalThis:window);
