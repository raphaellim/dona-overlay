(function(){
  const params = new URLSearchParams(location.search);
  const station = params.get('station') || 'default';
  const token = params.get('token') || '';
  let lastRunId = '';
  let spinTimer = null;
  let hideTimer = null;
  let known = null;

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
  function esc(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
  function ensureRoot(){
    let root = document.getElementById('rouletteOverlayRoot');
    if(root) return root;
    root = document.createElement('div');
    root.id = 'rouletteOverlayRoot';
    root.className = 'roulette-overlay-root';
    root.innerHTML = '<div class="roulette-stage"><div class="roulette-title" id="rouletteOverlayTitle">룰렛</div><div class="roulette-slot"><div class="roulette-name" id="rouletteOverlayName">-</div></div><div class="roulette-meta" id="rouletteOverlayMeta"></div><div class="roulette-result">RESULT</div></div><div class="roulette-history"><div class="roulette-history-title">최근 룰렛 결과</div><div class="roulette-history-list" id="rouletteOverlayHistory"></div></div>';
    document.body.appendChild(root);
    return root;
  }
  function enabledItems(roulette, listId){
    const list = (roulette.lists||[]).find(x=>x.id===listId) || (roulette.lists||[])[0] || {items:[]};
    return (list.items||[]).filter(x=>x.enabled!==false && x.text).map(x=>x.text);
  }
  function renderHistory(roulette){
    const el = document.getElementById('rouletteOverlayHistory');
    if(!el) return;
    const arr = (roulette.history||[]).slice(-3).reverse();
    el.innerHTML = arr.length ? arr.map(x=>`<span class="roulette-history-chip">${esc(x.result)}</span>`).join('') : '<span class="roulette-history-chip">대기</span>';
  }
  function showDone(run, roulette){
    const root = ensureRoot();
    clearInterval(spinTimer); spinTimer = null;
    document.getElementById('rouletteOverlayTitle').textContent = run.listTitle || '룰렛';
    document.getElementById('rouletteOverlayName').textContent = run.result || '-';
    const meta = run.mode === 'auto' && run.donor ? `${run.donor} / ${Number(run.amount||0).toLocaleString()}원` : '당첨 결과 확정';
    document.getElementById('rouletteOverlayMeta').textContent = meta;
    root.classList.toggle('side', (roulette.displayMode||'center') === 'side');
    root.classList.add('show','done');
    renderHistory(roulette);
    clearTimeout(hideTimer);
    hideTimer = setTimeout(()=>{ root.classList.remove('show','done'); }, Number(roulette.resultHoldMs||10000));
  }
  function startSpin(run, roulette){
    const root = ensureRoot();
    const nameEl = document.getElementById('rouletteOverlayName');
    document.getElementById('rouletteOverlayTitle').textContent = run.listTitle || '룰렛';
    document.getElementById('rouletteOverlayMeta').textContent = run.mode === 'auto' ? '후원 자동 룰렛 START' : '수동 룰렛 START';
    root.classList.toggle('side', (roulette.displayMode||'center') === 'side');
    root.classList.add('show');
    root.classList.remove('done');
    renderHistory(roulette);
    const pool = enabledItems(roulette, run.listId);
    const started = Number(run.startedAt || Date.now());
    const duration = Math.max(1200, Number(run.duration || roulette.duration || 5000));
    clearInterval(spinTimer);
    function tick(){
      const elapsed = Date.now() - started;
      if(elapsed >= duration){ showDone(run, roulette); return; }
      const progress = Math.max(0, Math.min(1, elapsed / duration));
      const delay = 35 + Math.pow(progress, 2.5) * 260;
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
      known = roulette;
      const run = roulette.current;
      if(run && run.running && run.runId){
        if(run.runId !== lastRunId){
          lastRunId = run.runId;
          startSpin(run, roulette);
        }else{
          renderHistory(roulette);
        }
      }else{
        renderHistory(roulette);
      }
    }catch(e){/* keep overlay quiet */}
  }
  window.addEventListener('DOMContentLoaded', ()=>{ ensureRoot(); poll(); setInterval(poll, 1000); });
})();
