let roulette={lists:[],autoRules:[],history:[]};
let selectedListId='';
let editingListId='';
let sequenceRunning=false;
let singleRunLock=false;
let currentRole='guest';
function isManagerRole(){return currentRole==='broadcast_manager'}
const MIN_RESULT_VISIBLE_MS=3100;
const IS_MOBILE=document.body.classList.contains('mobile');
function RQ(s){return document.querySelector(s);}
function esc(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
function fmt(n){return Number(n||0).toLocaleString();}
function gid(prefix){return prefix+'_'+Date.now()+'_'+Math.random().toString(36).slice(2,6)}
function fmtPct(v){const n=Number(v||0);return Number.isInteger(n)?String(n):String(Number(n.toFixed(4))).replace(/\.?0+$/,'');}
function parseRouletteLine(line,type){const off=line.startsWith('#');let raw=(off?line.slice(1):line).trim();let text=raw,percent='';if(type==='probability'){const parts=raw.split(/[|,]/).map(x=>x.trim()).filter(Boolean);if(parts.length>=2){text=parts.slice(0,-1).join(' ');percent=parts[parts.length-1];}else{const m=raw.match(/^(.*?)(?:\s+)(\d+(?:\.\d+)?)%?$/);if(m){text=m[1].trim();percent=m[2];}}}const n=String(percent).trim()===''?0:Math.max(0,Number(String(percent).replace('%',''))||0);return {id:gid('item'),text:text.trim(),enabled:!off,weightPercent:n};}
function normalizeRoulettePercentItems(items){const active=(items||[]).filter(i=>i.enabled!==false&&i.text);const fixed=active.filter(i=>Number(i.weightPercent)>0);const blank=active.filter(i=>!(Number(i.weightPercent)>0));const fixedTotal=fixed.reduce((a,i)=>a+Number(i.weightPercent||0),0);const map=new Map();if(blank.length&&fixedTotal<=100){const each=(100-fixedTotal)/blank.length;active.forEach(i=>map.set(i.id,Number(i.weightPercent)>0?Number(i.weightPercent):each));}else{const total=fixedTotal>0?fixedTotal:active.length;active.forEach(i=>map.set(i.id,total>0?((Number(i.weightPercent||0)||0)/total)*100:0));}return (items||[]).map(i=>({...i,weightPercent:Number((map.get(i.id)||0).toFixed(4))}));}
function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
function setStatus(msg){const el=RQ('#status'); if(el) el.textContent=msg||'';}
function showTab(name){document.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('hidden',x.dataset.tab!==name));document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('on',x.dataset.open===name));}
function setButtonsRunning(on){sequenceRunning=on;document.querySelectorAll('[data-run-btn]').forEach(b=>{b.disabled=on;b.classList.toggle('running',on);});}
async function load(){try{const d=await api('/api/roulette');currentRole=d.role||'guest';roulette=d.roulette||{};if(!selectedListId)selectedListId=roulette.lists?.[0]?.id||'';render();setStatus('룰렛 데이터 로드 완료');}catch(e){alert(e.message)}}
async function save(){try{await api('/api/roulette/save',{method:'POST',body:JSON.stringify({roulette})});setStatus('저장 완료');await load();}catch(e){alert(e.message)}}
function activeList(){return (roulette.lists||[]).find(x=>x.id===selectedListId)||(roulette.lists||[])[0]}
function render(){renderManual();renderLists();renderRules();renderResult();applyRoleUI();}
function applyRoleUI(){if(!isManagerRole())return;document.querySelectorAll('.tab[data-open="auto"],.tab[data-open="lists"],[data-tab="auto"],[data-tab="lists"],#pcLink').forEach(el=>el.classList.add('hidden'));const clear=[...document.querySelectorAll('button')].find(b=>(b.textContent||'').includes('RESULT 초기화'));if(clear)clear.classList.add('hidden');if(document.querySelector('.tab.on.hidden'))showTab('manual');}
function renderManual(){const box=RQ('#manualList');if(!box)return;const lists=roulette.lists||[];box.innerHTML=lists.length?lists.map(l=>`<label class="pill ${selectedListId===l.id?'on':''}"><input class="checkbox" type="checkbox" ${selectedListId===l.id?'checked':''} onchange="selectList('${l.id}')"><span>${esc(l.title)}</span><span class="muted">${(l.items||[]).filter(i=>i.enabled!==false).length}개</span></label>`).join(''):'<div class="muted">룰렛 리스트를 먼저 추가하세요.</div>';const sel=RQ('#pcSelectList'); if(sel){sel.innerHTML=lists.map(l=>`<option value="${esc(l.id)}" ${selectedListId===l.id?'selected':''}>${esc(l.title)}</option>`).join('');} }
function selectList(id){selectedListId=id;renderManual();}
function selectListFromPc(v){selectedListId=v;renderManual();}
async function startRoulette(extra={}){
  const isBatch=!!extra.batchId;
  if(sequenceRunning && !isBatch)return;
  if(singleRunLock && !isBatch){setStatus('이전 룰렛 결과 표시 중입니다. 잠시 후 다시 눌러주세요.');return;}
  try{
    if(!selectedListId)return alert('룰렛을 선택하세요.');
    if(!isBatch){singleRunLock=true;setButtonsRunning(true);setStatus('룰렛 실행 중...');}
    const donor=(RQ('#manualDonor')?.value||'').trim();
    const d=await api('/api/roulette/start',{method:'POST',body:JSON.stringify({listId:selectedListId,duration:roulette.duration||3600,donor,...extra})});
    setStatus('RESULT: '+(d.result||''));
    roulette=d.roulette||roulette;
    render();
    return d;
  }catch(e){alert(e.message);throw e;}
  finally{
    if(!isBatch){
      const wait=Math.max(MIN_RESULT_VISIBLE_MS,Number(roulette.duration||3600)+MIN_RESULT_VISIBLE_MS);
      setTimeout(()=>{singleRunLock=false;setButtonsRunning(false);setStatus('다음 룰렛 실행 가능');},wait);
    }
  }
}
async function startMultiRoulette(){
  try{
    if(!selectedListId)return alert('룰렛을 선택하세요.');
    const inp=RQ('#repeatCount');
    const count=Math.max(1,Math.min(50,Math.trunc(Number(inp?.value||1))));
    const batchId=gid('batch');
    const donor=(RQ('#manualDonor')?.value||'').trim();
    setButtonsRunning(true);
    setStatus(`연속 룰렛 예약: ${count}회`);
    const d=await api('/api/roulette/start',{method:'POST',body:JSON.stringify({listId:selectedListId,duration:roulette.duration||3600,count,batchId,donor})});
    roulette=d.roulette||roulette;
    render();
    setStatus(`연속 룰렛 실행 중: ${count}회`);
    showTab('result');
  }catch(e){alert(e.message)}
  finally{
    const count=Math.max(1,Math.min(50,Math.trunc(Number(RQ('#repeatCount')?.value||1))));
    const wait=(Math.max(1200,Number(roulette.duration||3600))+MIN_RESULT_VISIBLE_MS)*count;
    setTimeout(()=>{setButtonsRunning(false);setStatus('다음 룰렛 실행 가능');load();}, wait);
  }
}
async function resetOverlay(){try{await api('/api/roulette/reset',{method:'POST',body:'{}'});setStatus('오버레이 룰렛 숨김');await load();}catch(e){alert(e.message)}}
async function clearHistory(){if(!confirm('룰렛 결과 기록을 삭제할까요?'))return;try{await api('/api/roulette/history/clear',{method:'POST',body:'{}'});await load();}catch(e){alert(e.message)}}
function renderResult(){const el=RQ('#history');if(!el)return;const cur=roulette.current&&roulette.current.result?roulette.current:null;const last=(roulette.history||[]).slice(-1)[0]||null;const h=cur||last;const rows=(roulette.history||[]).slice(-50).reverse();if(!h&&!rows.length){el.innerHTML='<div class="muted">아직 RESULT 없음</div>';return;}const lastBox=h?`<div class="resultBox"><div class="resultLabel">LAST RESULT</div><div class="resultValue">${esc(h.result)}</div><div class="muted">${esc(h.mode==='auto'?'자동':'수동')} / ${esc(h.listTitle||'룰렛')} ${h.donor?'/ '+esc(h.donor):''} ${h.amount?'/ '+fmt(h.amount)+'원':''}</div></div>`:'';const list=rows.length?`<div class="resultList">${rows.map((r,idx)=>`<div class="resultRow"><span class="num">${rows.length-idx}.</span><span class="txt">${esc(r.result)}</span><span class="meta">${esc(r.listTitle||'룰렛')}${r.batchId&&r.total?` / 연속 ${r.sequence}/${r.total}`:''}</span></div>`).join('')}</div>`:'';el.innerHTML=lastBox+list;}
function renderLists(){const el=RQ('#rouletteLists');if(!el)return;el.innerHTML=(roulette.lists||[]).map(l=>`<div class="item"><div><b>${esc(l.title)}</b><div class="muted">${l.type==='probability'?'확률형':'일반'} / 전체 ${(l.items||[]).length}개 / 사용 ${(l.items||[]).filter(i=>i.enabled!==false).length}개</div></div><div><button class="btn cyan mini" onclick="editList('${l.id}')">수정</button> <button class="btn red mini" onclick="deleteList('${l.id}')">삭제</button></div></div>`).join('')||'<div class="muted">리스트 없음</div>';}
function newList(){editingListId='';RQ('#editTitle').value='';if(RQ('#editType'))RQ('#editType').value='normal';RQ('#editItems').value='';updateEditHelp();RQ('#editBox').classList.remove('hidden');}
function editList(id){const l=(roulette.lists||[]).find(x=>x.id===id);if(!l)return;editingListId=id;RQ('#editTitle').value=l.title||'';if(RQ('#editType'))RQ('#editType').value=l.type==='probability'?'probability':'normal';RQ('#editItems').value=(l.items||[]).map(i=>{const prefix=i.enabled===false?'# ':'';return prefix+i.text+(l.type==='probability'?' '+fmtPct(i.weightPercent):'');}).join('\n');updateEditHelp();RQ('#editBox').classList.remove('hidden');}
function closeEdit(){editingListId='';RQ('#editBox').classList.add('hidden');}
function updateEditHelp(){const type=RQ('#editType')?.value||'normal';const help=RQ('#editHelp');if(!help)return;help.innerHTML=type==='probability'?`확률형: <b>이름 확률</b> 형태로 입력. 확률 공란은 남은 퍼센트를 자동 분배합니다. 합계가 100 미만/초과여도 저장 시 100 기준으로 자동 보정됩니다.<br>예: ㅁㅁ 1.5 / ㅇㅇ 3.3 / ㅂㅂ 10 / ㅎㅎ / ㅅㅅ`:'한 줄에 항목 하나씩 입력. 앞에 #을 붙이면 목록에는 남기고 추첨 제외.';}
function saveList(){const title=RQ('#editTitle').value.trim();const type=RQ('#editType')?.value==='probability'?'probability':'normal';const lines=RQ('#editItems').value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);if(!title)return alert('룰렛 이름 입력');if(!lines.length)return alert('항목 입력');let items=lines.map(line=>parseRouletteLine(line,type)).filter(x=>x.text);if(type==='probability')items=normalizeRoulettePercentItems(items);if(editingListId){const l=roulette.lists.find(x=>x.id===editingListId);l.title=title;l.type=type;l.items=items;}else{const id=gid('roulette');(roulette.lists||(roulette.lists=[])).push({id,title,type,items});selectedListId=id;}closeEdit();render();save();}
function deleteList(id){if(!confirm('룰렛 리스트를 삭제할까요?'))return;roulette.lists=(roulette.lists||[]).filter(x=>x.id!==id);roulette.autoRules=(roulette.autoRules||[]).filter(x=>x.listId!==id);if(selectedListId===id)selectedListId=roulette.lists?.[0]?.id||'';render();save();}
function renderRules(){const el=RQ('#autoRules');if(!el)return;const lists=roulette.lists||[];el.innerHTML=(roulette.autoRules||[]).map((r,idx)=>`<tr><td><input class="checkbox" type="checkbox" ${r.enabled?'checked':''} onchange="roulette.autoRules[${idx}].enabled=this.checked;save()"></td><td><input class="input" value="${r.minAmount||0}" onchange="roulette.autoRules[${idx}].minAmount=toWon(this.value);save()"></td><td>${IS_MOBILE?lists.map(l=>`<label class="pill ${r.listId===l.id?'on':''}"><input class="checkbox" type="checkbox" ${r.listId===l.id?'checked':''} onchange="roulette.autoRules[${idx}].listId='${l.id}';save()">${esc(l.title)}</label>`).join(''):`<select class="select" onchange="roulette.autoRules[${idx}].listId=this.value;save()">${lists.map(l=>`<option value="${esc(l.id)}" ${r.listId===l.id?'selected':''}>${esc(l.title)}</option>`).join('')}</select>`}</td><td><button class="btn red mini" onclick="delRule(${idx})">삭제</button></td></tr>`).join('')||'<tr><td colspan="4" class="muted">자동 룰렛 조건 없음</td></tr>';RQ('#duration').value=roulette.duration||3600;RQ('#hold').value=roulette.resultHoldMs||10000;RQ('#mode').value=roulette.displayMode||'box';RQ('#enabled').checked=roulette.enabled!==false;}
function addRule(){const first=roulette.lists?.[0]?.id;if(!first)return alert('룰렛 리스트를 먼저 만드세요.');(roulette.autoRules||(roulette.autoRules=[])).push({id:gid('rule'),enabled:true,minAmount:10000,listId:first});renderRules();save();}
function delRule(idx){roulette.autoRules.splice(idx,1);renderRules();save();}
function saveOptions(){roulette.enabled=RQ('#enabled').checked;roulette.duration=Number(RQ('#duration').value||3600);roulette.resultHoldMs=Number(RQ('#hold').value||10000);roulette.displayMode=RQ('#mode').value;save();}
window.addEventListener('DOMContentLoaded',()=>{document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>showTab(b.dataset.open));if(RQ('#editType'))RQ('#editType').addEventListener('change',updateEditHelp);showTab('manual');load();});
