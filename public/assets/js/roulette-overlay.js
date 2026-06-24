(function(){
  const params = new URLSearchParams(location.search);
  const station = params.get('station') || 'default';
  const token = params.get('token') || '';
  let lastRunId = '';
  let spinTimer = null;
  let spinRaf = null;
  let hideTimer = null;
  let activeRunId = '';
  let displayLockedUntil = 0;
  let pending = null;
  let spinAudio = null;
  let resultAudio = null;
  let resultPageTimer = null;
  let resultSoundRunId = '';
  let doneRunId = '';
  let flowToken = 0;
  let advancing = false;
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
  function clearHideTimer(){
    if(hideTimer){ clearTimeout(hideTimer); hideTimer = null; }
  }
  function clearSpinTimer(){
    if(spinTimer){
      clearInterval(spinTimer);
      spinTimer = null;
    }
    if(spinRaf){
      cancelAnimationFrame(spinRaf);
      spinRaf = null;
    }
  }
  function easeOutCubic(t){
    t = Math.max(0, Math.min(1, Number(t)||0));
    return 1 - Math.pow(1 - t, 3);
  }
  function pickRollingValue(pool, finalValue, previous){
    if(!pool.length) return finalValue || '-';
    if(pool.length === 1) return pool[0] || finalValue || '-';
    let value = previous;
    let guard = 0;
    while(value === previous && guard < 8){
      value = pool[Math.floor(Math.random() * pool.length)] || finalValue || '-';
      guard += 1;
    }
    return value || finalValue || '-';
  }
  function clearResultPageTimer(){
    if(resultPageTimer){
      clearTimeout(resultPageTimer);
      resultPageTimer = null;
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
  function resultRowsForFinal(run, roulette){
    const total = Number(run.total || 0);
    const sequence = Number(run.sequence || 0);
    if(total > 1 && sequence >= total){
      const rows = batchRows(run, roulette);
      if(rows.length > 1) return rows;
    }
    return [];
  }
  function renderResultPage(run, roulette, pageIndex){
    const head = document.getElementById('rouletteOverlayResult');
    const listEl = document.getElementById('rouletteOverlayResultList');
    const rows = resultRowsForFinal(run, roulette);
    const pageSize = 5;
    if(rows.length > 1){
      const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
      const safePage = Math.max(0, Math.min(totalPages - 1, Number(pageIndex || 0)));
      const pageRows = rows.slice(safePage * pageSize, safePage * pageSize + pageSize);
      const total = Number(run.total || rows.length);
      head.querySelector('.roulette-result-head').textContent = totalPages > 1 ? `RESULT ${safePage + 1}/${totalPages}` : `RESULT ${rows.length}/${total}`;
      listEl.innerHTML = pageRows.map((r,idx)=>{
        const num = safePage * pageSize + idx + 1;
        return `<div class="roulette-result-row"><span>${num}.</span><b>${esc(r.result)}</b></div>`;
      }).join('');
      return totalPages;
    }
    head.querySelector('.roulette-result-head').textContent = 'RESULT';
    listEl.innerHTML = `<div class="roulette-result-single">${esc(run.result || '-')}</div>`;
    return 1;
  }
  function startResultPaging(run, roulette, perPageMs){
    clearResultPageTimer();
    const totalPages = renderResultPage(run, roulette, 0);
    if(totalPages <= 1) return totalPages;
    let page = 1;
    const next = ()=>{
      if(page >= totalPages) return;
      renderResultPage(run, roulette, page);
      page += 1;
      if(page < totalPages){
        resultPageTimer = setTimeout(next, Math.max(700, Number(perPageMs || 1000)));
      }
    };
    resultPageTimer = setTimeout(next, Math.max(700, Number(perPageMs || 1000)));
    return totalPages;
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
    const myToken = flowToken;
    clearSpinTimer();
    clearResultPageTimer();
    clearHideTimer();
    stopSpinSound();

    const root = ensureRoot();
    const total = Number(run.total || 0);
    const sequence = Number(run.sequence || 0);
    const isBatch = total > 1;
    const isFinalInBatch = !isBatch || sequence >= total;
    const perPageResultVisibleMs = isFinalInBatch
      ? Math.max(MIN_RESULT_VISIBLE_MS, Number(roulette.resultHoldMs || 0))
      : INTERMEDIATE_RESULT_VISIBLE_MS;
    const finalRows = resultRowsForFinal(run, roulette);
    const resultPageCount = isFinalInBatch && finalRows.length > 5 ? Math.ceil(finalRows.length / 5) : 1;
    const resultVisibleMs = perPageResultVisibleMs * resultPageCount;

    root.classList.remove('done');
    root.classList.add('show','stopped');
    document.getElementById('rouletteOverlayTitle').textContent = titleText(run);
    document.getElementById('rouletteOverlayName').textContent = run.result || '-';
    const meta = isBatch ? `연속 룰렛 ${sequence}/${total}` : (run.mode === 'auto' ? '자동 룰렛' : '수동 룰렛');
    document.getElementById('rouletteOverlayMeta').textContent = meta;
    activeRunId = run.runId;

    displayLockedUntil = Date.now() + RESULT_POP_DELAY_MS + resultVisibleMs;
    hideTimer = setTimeout(()=>{
      if(myToken !== flowToken) return;
      root.classList.remove('stopped');
      root.classList.add('done');
      startResultPaging(run, roulette, perPageResultVisibleMs);
      playResultSound(run.runId);

      clearHideTimer();
      hideTimer = setTimeout(async ()=>{
        if(myToken !== flowToken) return;
        if(advancing) return;
        advancing = true;
        try{
          markCompletedRun(run.runId);
          const out = await postJson('/api/roulette/advance', {runId: run.runId});
          advancing = false;
          if(out.run && out.run.runId && out.run.runId !== run.runId){
            lastRunId = out.run.runId;
            root.classList.remove('done','stopped');
            startSpin(out.run, out.roulette || roulette);
            return;
          }
        }catch(e){ advancing = false; }
        root.classList.remove('show','done','stopped','spinning');
        activeRunId = '';
        doneRunId = '';
        stopSpinSound();
        clearResultPageTimer();
        if(resultAudio){ try{ resultAudio.pause(); resultAudio.currentTime = 0; }catch(e){} }
        if(pending){
          const next=pending; pending=null; lastRunId = next.run?.runId || lastRunId; startSpin(next.run,next.roulette);
        }
      }, resultVisibleMs);
    }, RESULT_POP_DELAY_MS);
  }
  function startSpin(run, roulette){
    if(!run || !run.runId) return;
    if(activeRunId === run.runId && (document.getElementById('rouletteOverlayRoot')?.classList.contains('show'))) return;
    flowToken += 1;
    clearHideTimer();
    advancing = false;
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
    clearResultPageTimer();
    const root = ensureRoot();
    const nameEl = document.getElementById('rouletteOverlayName');
    document.getElementById('rouletteOverlayTitle').textContent = titleText(run);
    document.getElementById('rouletteOverlayMeta').textContent = run.mode === 'auto' ? '자동 룰렛' : (Number(run.total||0)>1 ? `연속 룰렛 ${run.sequence}/${run.total}` : '수동 룰렛');
    document.getElementById('rouletteOverlayResultList').innerHTML = '';
    root.classList.add('show','spinning');
    root.classList.remove('done','stopped');
    activeRunId = run.runId;
    const pool = enabledItems(roulette, run.listId);
    const started = performance.now();
    const duration = Math.max(1600, Number(run.duration || roulette.duration || 4200));
    let nextSwapAt = 0;
    let lastValue = '';
    playSpinSound(duration);
    function applyValue(value){
      nameEl.textContent = value || '-';
      nameEl.classList.remove('roulette-name-tick');
      // 강제 reflow로 짧은 슬롯 느낌만 주고, 전체 박스 재배치는 하지 않습니다.
      void nameEl.offsetWidth;
      nameEl.classList.add('roulette-name-tick');
    }
    function frame(ts){
      const elapsed = ts - started;
      const progress = Math.max(0, Math.min(1, elapsed / duration));
      if(elapsed >= duration){
        root.classList.remove('spinning');
        nameEl.classList.remove('roulette-name-tick');
        showDone(run, roulette);
        return;
      }
      if(ts >= nextSwapAt){
        const value = pickRollingValue(pool, run.result, lastValue);
        lastValue = value;
        applyValue(value);
        // 처음에는 빠르게, 마지막에는 부드럽게 감속합니다.
        const delay = 26 + easeOutCubic(progress) * 285;
        nextSwapAt = ts + delay;
      }
      spinRaf = requestAnimationFrame(frame);
    }
    applyValue(pickRollingValue(pool, run.result, ''));
    spinRaf = requestAnimationFrame(frame);
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
        if(advancing || activeRunId === run.runId) return;
        if(run.runId !== lastRunId){
          lastRunId = run.runId;
          startSpin(run, roulette);
        }
      }
    }catch(e){/* keep overlay quiet */}
  }
  window.addEventListener('beforeunload', ()=>{ clearSpinTimer(); clearResultPageTimer(); clearHideTimer(); stopSpinSound(); if(resultAudio){ try{ resultAudio.pause(); resultAudio.currentTime=0; }catch(e){} } });
  window.addEventListener('DOMContentLoaded', ()=>{ ensureRoot(); poll(); setInterval(poll, 500); });
})();
