(function(){
  const params = new URLSearchParams(location.search);
  const station = params.get('station') || 'default';
  const token = params.get('token') || '';
  let lastRunId = '';
  let spinTimer = null;
  let hideTimer = null;
  let activeRunId = '';
  let displayLockedUntil = 0;
  let pending = null;
  const MIN_RESULT_VISIBLE_MS = 2600;

  function apiUrl(path){
    const u = new URL(path, location.origin);
    u.searchParams.set('station', station);
    if(token) u.searchParams.set('token', token);
    return u.pathname + u.search;
  }
  async function fetchJson(path){
    const r = await fetch(apiUrl(path), {cache:'no-store'});
    const j = await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(j.error || 'roulette api failed');
    return j;
  }
  async function postJson(path, body){
    const r = await fetch(apiUrl(path), {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body||{})});
    const j = await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(j.error || 'roulette api failed');
    return j;
  }
  function esc(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
  function ensureRoot(){
    let root = document.getElementById('rouletteOverlayRoot');
    if(root) return root;
    root = document.createElement('section');
    root.id = 'rouletteOverlayRoot';
    root.className = 'roulette-overlay-root roulette-alert-root';
    root.innerHTML = '<div class="roulette-stage"><div class="roulette-title" id="rouletteOverlayTitle">룰렛</div><div class="roulette-slot"><div class="roulette-name" id="rouletteOverlayName">-</div></div><div class="roulette-meta" id="rouletteOverlayMeta"></div><div class="roulette-result" id="rouletteOverlayResult"><div class="roulette-result-head">RESULT</div><div class="roulette-result-list" id="rouletteOverlayResultList"></div></div></div>';
    document.body.appendChild(root);
    return root;
  }
  function enabledItems(roulette, listId){
    const list = (roulette.lists||[]).find(x=>x.id===listId) || (roulette.lists||[])[0] || {items:[]};
    return (list.items||[]).filter(x=>x.enabled!==false && x.text).map(x=>x.text);
  }
  function batchRows(run, roulette){
    if(!run.batchId) return [];
    return (roulette.history||[])
      .filter(h=>h.batchId===run.batchId)
      .sort((a,b)=>(Number(a.sequence||0)-Number(b.sequence||0)) || (Number(a.createdAt||0)-Number(b.createdAt||0)));
  }
  function renderResultWindow(run, roulette){
    const head = document.getElementById('rouletteOverlayResult');
    const listEl = document.getElementById('rouletteOverlayResultList');
    const rows = batchRows(run, roulette);
    if(rows.length > 1 || Number(run.total||0) > 1){
      const total = Number(run.total || rows.length || 0);
      head.querySelector('.roulette-result-head').textContent = total ? `RESULT ${rows.length}/${total}` : 'RESULT';
      listEl.innerHTML = rows.map((r,idx)=>`<div class="roulette-result-row"><span>${idx+1}.</span><b>${esc(r.result)}</b></div>`).join('');
    }else{
      head.querySelector('.roulette-result-head').textContent = 'RESULT';
      listEl.innerHTML = `<div class="roulette-result-single">${esc(run.result || '-')}</div>`;
    }
  }
  function showDone(run, roulette){
    const root = ensureRoot();
    clearInterval(spinTimer); spinTimer = null;
    document.getElementById('rouletteOverlayTitle').textContent = run.listTitle || '룰렛 결과';
    document.getElementById('rouletteOverlayName').textContent = run.result || '-';
    const meta = run.mode === 'auto' && run.donor ? `${run.donor} / ${Number(run.amount||0).toLocaleString()}원` : (Number(run.total||0)>1 ? `연속 룰렛 ${run.sequence}/${run.total}` : '룰렛 결과');
    document.getElementById('rouletteOverlayMeta').textContent = meta;
    renderResultWindow(run, roulette);
    root.classList.add('show','done');
    displayLockedUntil = Date.now() + MIN_RESULT_VISIBLE_MS;
    clearTimeout(hideTimer);
    const holdMs = Number(roulette.resultHoldMs||10000);
    hideTimer = setTimeout(()=>{ root.classList.remove('show','done'); }, holdMs);
    setTimeout(async ()=>{
      try{
        const out = await postJson('/api/roulette/advance', {runId: run.runId});
        if(out && out.run && out.run.runId){
          clearTimeout(hideTimer);
          lastRunId = out.run.runId;
          startSpin(out.run, out.roulette || roulette);
          return;
        }
      }catch(e){}
      if(pending && Date.now() >= displayLockedUntil){
        const next=pending; pending=null; startSpin(next.run,next.roulette);
      }
    }, MIN_RESULT_VISIBLE_MS + 120);
  }
  function startSpin(run, roulette){
    const now=Date.now();
    if((spinTimer || now < displayLockedUntil) && activeRunId && run.runId !== activeRunId){
      pending={run,roulette};
      return;
    }
    activeRunId = run.runId || activeRunId;
    const root = ensureRoot();
    const nameEl = document.getElementById('rouletteOverlayName');
    document.getElementById('rouletteOverlayTitle').textContent = run.listTitle || '룰렛';
    document.getElementById('rouletteOverlayMeta').textContent = run.mode === 'auto' ? '자동 룰렛' : (Number(run.total||0)>1 ? `연속 룰렛 ${run.sequence}/${run.total}` : '수동 룰렛');
    document.getElementById('rouletteOverlayResultList').innerHTML = '';
    root.classList.add('show');
    root.classList.remove('done');
    const pool = enabledItems(roulette, run.listId);
    const started = Number(run.startedAt || Date.now());
    const duration = Math.max(900, Number(run.duration || roulette.duration || 3600));
    clearInterval(spinTimer);
    function tick(){
      const elapsed = Date.now() - started;
      if(elapsed >= duration){ showDone(run, roulette); return; }
      const progress = Math.max(0, Math.min(1, elapsed / duration));
      const delay = 38 + Math.pow(progress, 2.35) * 230;
      const value = pool.length ? pool[Math.floor(Math.random()*pool.length)] : run.result;
      nameEl.textContent = value || '-';
      clearInterval(spinTimer);
      spinTimer = setInterval(tick, delay);
    }
    tick();
  }
  async function poll(){
    try{
      const data = await fetchJson('/api/roulette');
      const roulette = data.roulette || {};
      const run = roulette.current;
      if(run && run.running && run.runId){
        if(run.runId !== lastRunId){
          lastRunId = run.runId;
          startSpin(run, roulette);
        }
      }
    }catch(e){/* keep overlay quiet */}
  }
  window.addEventListener('DOMContentLoaded', ()=>{ ensureRoot(); poll(); setInterval(poll, 500); });
})();
