/* 재생 엔진을 직접 수정할 수 있는 경우에만 사용하는 연결 예제입니다.
 * 이 파일을 원본 iframe 바깥에서 로드해도 재생 종료를 감지하지 못합니다.
 * 원본 위젯 엔진의 실제 start/end/idle 콜백에서 아래 함수를 호출해야 합니다.
 * idle은 모든 투네 대기열까지 비어 있을 때만 전달하세요.
 * 투네 후원 수신 이벤트를 종료 이벤트로 대체하지 마세요.
 */
function createTooniePlaybackAdapter({station,token}){
 const playerId=crypto.randomUUID();let state='disconnected',heartbeat;
 async function send(){const response=await fetch('/api/toonie-playback?'+new URLSearchParams({station,token}),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({playerId,state})});if(!response.ok)throw Error('재생 상태 전송 실패');}
 return {async start(){state='start';await send();},async idle(){state='idle';await send();},async connect(){await send();heartbeat=setInterval(()=>send().catch(()=>{}),5000);},async disconnect(){clearInterval(heartbeat);state='disconnected';await send();}};
}
