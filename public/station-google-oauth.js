(()=>{'use strict';
const station=new URLSearchParams(location.search).get('station');if(!station)return;
const endpoint='/api/youtube-chat-service',query='?station='+encodeURIComponent(station);
const panel=document.createElement('details');panel.style.cssText='padding:16px;margin:16px;border:1px solid #718096;border-radius:12px';
const heading=document.createElement('summary');heading.textContent='이 방송국의 Google Cloud API 연결';panel.append(heading);
const note=document.createElement('p');note.textContent='YouTube Data API v3를 활성화한 프로젝트의 웹 애플리케이션 OAuth 정보를 입력하세요. 인증된 채팅 전송에는 별도 API 키가 필요하지 않습니다.';panel.append(note);
function field(title,type){const label=document.createElement('label');label.style.display='block';label.textContent=title;const input=document.createElement('input');input.type=type;input.autocomplete='off';input.style.cssText='display:block;width:100%;box-sizing:border-box;margin:8px 0';label.append(input);panel.append(label);return input;}
const id=field('OAuth 클라이언트 ID','text'),secret=field('클라이언트 보안 비밀번호 · 비워두면 기존 값 유지','password'),redirect=field('Google Cloud에 등록할 승인된 리디렉션 URI','text');redirect.readOnly=true;
const save=document.createElement('button');save.textContent='이 방송국 API 설정 저장';panel.append(save);const status=document.createElement('p');status.setAttribute('role','status');panel.append(status);
const anchor=document.querySelector('main,.container,.wrap')||document.body;anchor.prepend(panel);
async function request(path,body){const r=await fetch(endpoint+path+query,{method:body?'PATCH':'GET',credentials:'same-origin',cache:'no-store',headers:body?{'Content-Type':'application/json'}:{},...(body?{body:JSON.stringify(body)}:{})});const data=await r.json();if(!r.ok)throw Error(data.error||'API 설정 요청 실패');return data;}
request('/oauth-info').then(info=>{id.value=info.clientId||'';redirect.value=info.redirectUri||'';panel.open=!info.configured;status.textContent=info.configured?'방송국 전용 OAuth 설정 저장됨':'이 방송국의 OAuth 설정이 필요합니다.';}).catch(e=>{panel.open=true;status.textContent=e.message;});
save.onclick=async()=>{save.disabled=true;try{await request('/oauth-config',{clientId:id.value.trim(),clientSecret:secret.value.trim()});secret.value='';status.textContent='저장 완료. Google Cloud 설정을 바꿨다면 구글 계정을 다시 연결하세요.';const reload=document.createElement('button');reload.textContent='연결 화면 새로고침';reload.onclick=()=>location.reload();status.append(document.createElement('br'),reload);}catch(e){status.textContent=e.message;}finally{save.disabled=false;}};
})();
