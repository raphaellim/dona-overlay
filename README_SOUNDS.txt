<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>최고관리자 - 방송국 관리</title>
<link rel="stylesheet" href="/app.css">
<style>
body{background:#070b12;color:#e5e7eb}.wrap{max-width:1180px;margin:0 auto;padding:22px}.top{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px}.title{font-size:30px;font-weight:950}.card{background:#0b1220;border:1px solid #253247;border-radius:18px;padding:16px;margin-bottom:14px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.row{margin-bottom:10px}label{display:block;font-size:13px;color:#cbd5e1;font-weight:900;margin-bottom:6px}.input{width:100%;background:#070b12;color:#fff;border:1px solid #334155;border-radius:12px;padding:11px 12px}.btn{border:0;border-radius:12px;padding:10px 13px;font-weight:900;cursor:pointer;background:#334155;color:#fff}.green{background:#16a34a}.blue{background:#2563eb}.red{background:#dc2626}.mini{font-size:12px;padding:7px 9px}.station{display:grid;grid-template-columns:1fr auto;gap:10px;align-items:center;border:1px solid #334155;border-radius:14px;padding:12px;margin-bottom:8px;background:#0f172a}.mono{font-family:ui-monospace,Consolas,monospace}.muted{color:#94a3b8;font-size:13px}@media(max-width:900px){.grid,.station{grid-template-columns:1fr}.top{align-items:flex-start;flex-direction:column}}
</style>
</head>
<body>
<div class="wrap">
  <div class="top">
    <div>
      <div class="title">최고관리자 / 방송국 관리</div>
      <div class="muted">방송국 생성, 관리자 비밀번호, 오버레이 토큰을 관리합니다.</div>
    </div>
    <a class="btn" href="/station_login.html">방송국 로그인</a>
  </div>
  <div class="grid">
    <section class="card">
      <h2>방송국 생성</h2>
      <div class="row"><label>최고관리자 PW</label><input id="masterPw" class="input" type="password"></div>
      <div class="row"><label>방송국명</label><input id="name" class="input" placeholder="빵떠기방송국"></div>
      <div class="row"><label>방송국 코드</label><input id="slug" class="input mono" placeholder="bbtv"></div>
      <div class="row"><label>방송국 관리자 비밀번호</label><input id="stationPw" class="input" placeholder="관리자에게 줄 비밀번호"></div>
      <button class="btn green" onclick="createStation()">방송국 생성</button>
    </section>
    <section class="card">
      <h2>방송국 목록</h2>
      <div id="stations"></div>
    </section>
  </div>
</div>
<script src="/common.js"></script>
<script>
let stations=[];
async function load(){
  try{
    const data=await api('/api/stations',{headers:{'x-admin-password':document.getElementById('masterPw').value}});
    stations=data.stations||[];
    render();
  }catch(e){
    document.getElementById('stations').innerHTML='<div class="muted">최고관리자 PW 입력 후 새로고침/생성하세요.</div>';
  }
}
function render(){
  document.getElementById('stations').innerHTML=stations.map(s=>`
    <div class="station">
      <div>
        <b>${esc(s.name)}</b> <span class="muted mono">/${esc(s.slug)}</span><br>
        <span class="muted">token: </span><span class="mono">${esc(s.overlayToken)}</span><br>
        <span class="muted">오버레이: </span><span class="mono">${location.origin}/overlay.html?station=${encodeURIComponent(s.slug)}&token=${encodeURIComponent(s.overlayToken)}</span>
      </div>
      <div>
        <button class="btn blue mini" onclick="openStation('${s.slug}')">관리</button>
        <button class="btn mini" onclick="copyOverlay('${s.slug}','${s.overlayToken}')">복사</button>
        <button class="btn red mini" onclick="regen('${s.id}')">토큰재생성</button>
      </div>
    </div>
  `).join('');
}
async function createStation(){
  const pw=document.getElementById('masterPw').value;
  try{
    await api('/api/stations',{method:'POST',headers:{'x-admin-password':pw},body:JSON.stringify({
      name:document.getElementById('name').value,
      slug:document.getElementById('slug').value,
      stationAdminPassword:document.getElementById('stationPw').value
    })});
    alert('방송국 생성 완료'); await load();
  }catch(e){alert(e.message)}
}
async function regen(id){
  const pw=document.getElementById('masterPw').value;
  try{await api('/api/stations/'+id+'/token',{method:'POST',headers:{'x-admin-password':pw}}); await load();}catch(e){alert(e.message)}
}
function openStation(slug){location.href='/station_control.html?station='+encodeURIComponent(slug)}
async function copyOverlay(slug,token){
  const url=`${location.origin}/overlay.html?station=${encodeURIComponent(slug)}&token=${encodeURIComponent(token)}`;
  try{await navigator.clipboard.writeText(url);alert('복사 완료')}catch{prompt('복사하세요',url)}
}
load();
</script>
</body>
</html>