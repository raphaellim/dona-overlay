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
  let spinAudio = null;
  let resultAudio = null;
  let resultSoundRunId = '';
  let doneRunId = '';
  const completedRunKey = `roulette_completed_${station}`;
  const MIN_RESULT_VISIBLE_MS = 3100;
  const RESULT_POP_DELAY_MS = 750;
  const INTERMEDIATE_RESULT_VISIBLE_MS = 1000;

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
  function getCompletedRuns(){
    try{ return JSON.parse(localStorage.getItem(completedRunKey)||'[]').slice(-120); }catch(e){ return []; }
  }
  function isCompletedRun(runId){ return !!runId && getCompletedRuns().includes(String(runId)); }
  function markCompletedRun(runId){
    if(!runId) return;
    const list = getCompletedRuns().filter(x=>x!==String(runId));
    list.push(String(runId));
    try{ localStorage.setItem(completedRunKey, JSON.stringify(list.slice(-120))); }catch(e){}
  }
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
    const list = (roulette.lists||[]).find(x=>x.id===listId);
    return (list?.items||[]).filter(i=>i.enabled!==false && i.text).map(i=>i.text);
  }
  function batchRows(run, roulette){
    if(!run.batchId || !run.total || run.total <= 1) return [];
    return (roulette.history||[])
      .filter(h=>h.batchId===run.batchId)
      .sort((a,b)=>Number(a.sequence||0)-Number(b.sequence||0));
  }
  function clearSpinTimer(){
    if(spinTimer){
      clearInterval(spinTimer);
      spinTimer = null;
    }
  }
  function stopSpinSound(){
    if(spinAudio){
      try{ spinAudio.pause(); spinAudio.currentTime = 0; }catch(e){}
      spinAudio = null;
    }
  }
  function playSpinSound(duration){
    stopSpinSound();
    try{
      spinAudio = new Audio('/sounds/roulette_spin.mp3');
      spinAudio.loop = true;
      spinAudio.volume = 0.72;
      spinAudio.play().catch(()=>{});
      setTimeout(stopSpinSound, Math.max(900, Number(duration||0)) + 120);
    }catch(e){}
  }
  function playResultSound(runId){
    if(runId && resultSoundRunId === runId) return;
    resultSoundRunId = runId || resultSoundRunId;
    try{
      if(resultAudio){ resultAudio.pause(); resultAudio.currentTime = 0; }
      resultAudio = new Audio('/sounds/roulette_result.mp3');
      resultAudio.loop = false;
      resultAudio.volume = 0.95;
      resultAudio.play().catch(()=>{});
      setTimeout(()=>{ try{ resultAudio.pause(); resultAudio.currentTime = 0; }catch(e){} }, 1000);
    }catch(e){}
  }
  function renderResultWindow(run, roulette){
    const head = document.getElementById('rouletteOverlayResult');
    const listEl = document.getElementById('rouletteOverlayResultList');
    const rows = batchRows(run, roulette);
    if(rows.length > 1){
      const total = Number(run.total||0);
      head.querySelector('.roulette-result-head').textContent = total ? `RESULT ${rows.length}/${total}` : 'RESULT';
      listEl.innerHTML = rows.map((r,idx)=>`<div class="roulette-result-row"><span>${idx+1}.</span><b>${esc(r.result)}</b></div>`).join('');
    }else{
      head.querySelector('.roulette-result-head').textContent = 'RESULT';
      listEl.innerHTML = `<div class="roulette-result-single">${esc(run.result || '-')}</div>`;
    }
  }
  function titleText(run){
    const donor = String(run.donor || '').trim();
    const title = String(run.listTitle || '룰렛').trim();
    return donor ? `${donor} · ${title}` : title;
  }
  function showDone(run, roulette){
    if(!run || !run.runId) return;
    if(doneRunId === run.runId) return;
    doneRunId = run.runId;
    clearSpinTimer();
    stopSpinSound();

    const root = ensureRoot();
    const total = Number(run.total || 0);
    const sequence = Number(run.sequence || 0);
    const isBatch = total > 1;
    const isFinalInBatch = !isBatch || sequence >= total;
    const resultVisibleMs = isFinalInBatch
      ? Math.max(MIN_RESULT_VISIBLE_MS, Number(roulette.resultHoldMs || 0))
      : INTERMEDIATE_RESULT_VISIBLE_MS;

    root.classList.remove('done');
    root.classList.add('stopped');
    document.getElementById('rouletteOverlayTitle').textContent = titleText(run);
    document.getElementById('rouletteOverlayName').textContent = run.result || '-';
    const meta = isBatch ? `연속 룰렛 ${sequence}/${total}` : (run.mode === 'auto' ? '자동 룰렛' : '수동 룰렛');
    document.getElementById('rouletteOverlayMeta').textContent = meta;
    activeRunId = run.runId;

    // 멈춘 이름을 먼저 보여주고 0.5~1초 뒤 RESULT가 덮어 나오게 합니다.
    displayLockedUntil = Date.now() + RESULT_POP_DELAY_MS + resultVisibleMs;
    clearTimeout(hideTimer);
    hideTimer = setTimeout(()=>{
      root.classList.remove('stopped');
      root.classList.add('done');
      renderResultWindow(run, roulette);
      playResultSound(run.runId);

      clearTimeout(hideTimer);
      hideTimer = setTimeout(async ()=>{
        try{
          const out = await postJson('/api/roulette/advance', {runId: run.runId});
          if(out.run){
            markCompletedRun(run.runId);
            root.classList.remove('done','stopped');
            startSpin(out.run, out.roulette || roulette);
            return;
          }
        }catch(e){}
        markCompletedRun(run.runId);
        root.classList.remove('show','done','stopped');
        activeRunId = '';
        doneRunId = '';
        stopSpinSound();
        if(resultAudio){ try{ resultAudio.pause(); resultAudio.currentTime = 0; }catch(e){} }
        if(pending){
          const next=pending; pending=null; startSpin(next.run,next.roulette);
        }
      }, resultVisibleMs);
    }, RESULT_POP_DELAY_MS);
  }
  function startSpin(run, roulette){
    if(run?.runId && isCompletedRun(run.runId)){
      // 새로고침 후 서버에 마지막 current가 잠깐 남아 있어도 다시 돌리지 않습니다.
      postJson('/api/roulette/advance', {runId: run.runId}).catch(()=>{});
      return;
    }
    const now=Date.now();
    if(now < displayLockedUntil){
      pending={run,roulette};
      setTimeout(()=>{ if(pending && Date.now()>=displayLockedUntil){ const next=pending; pending=null; startSpin(next.run,next.roulette); } }, displayLockedUntil-now+50);
      return;
    }
    doneRunId = '';
    clearSpinTimer();
    const root = ensureRoot();
    const nameEl = document.getElementById('rouletteOverlayName');
    document.getElementById('rouletteOverlayTitle').textContent = titleText(run);
    document.getElementById('rouletteOverlayMeta').textContent = run.mode === 'auto' ? '자동 룰렛' : (Number(run.total||0)>1 ? `연속 룰렛 ${run.sequence}/${run.total}` : '수동 룰렛');
    document.getElementById('rouletteOverlayResultList').innerHTML = '';
    root.classList.add('show');
    root.classList.remove('done');
    activeRunId = run.runId;
    const pool = enabledItems(roulette, run.listId);
    const started = Date.now();
    const duration = Math.max(900, Number(run.duration || roulette.duration || 3600));
    playSpinSound(duration);
    clearSpinTimer();
    function tick(){
      const elapsed = Date.now() - started;
      if(elapsed >= duration){ showDone(run, roulette); return; }
      const progress = Math.max(0, Math.min(1, elapsed / duration));
      const delay = 38 + Math.pow(progress, 2.35) * 230;
      const value = pool.length ? pool[Math.floor(Math.random()*pool.length)] : run.result;
      nameEl.textContent = value || '-';
      clearSpinTimer();
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
        if(isCompletedRun(run.runId)){
          lastRunId = run.runId;
          postJson('/api/roulette/advance', {runId: run.runId}).catch(()=>{});
          return;
        }
        if(run.runId !== lastRunId){
          lastRunId = run.runId;
          startSpin(run, roulette);
        }
      }
    }catch(e){/* keep overlay quiet */}
  }
  window.addEventListener('beforeunload', ()=>{ clearSpinTimer(); stopSpinSound(); if(resultAudio){ try{ resultAudio.pause(); resultAudio.currentTime=0; }catch(e){} } });
  window.addEventListener('DOMContentLoaded', ()=>{ ensureRoot(); poll(); setInterval(poll, 500); });
})();
