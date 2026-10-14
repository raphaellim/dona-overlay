# V6.1 콘솔 오류 수정

이전 console.html과 새 console.js가 같이 로드되면 제목 요소가 없어 textContent 오류가 발생하던 문제를 수정했습니다.
제목 영역이 없으면 자동 생성하고, 새 HTML에는 스크립트 캐시 갱신 주소를 적용했습니다.

적용: public/console.html, public/console.js, public/console.css, public/station_login.html을 함께 교체하고 서버 재배포 후 Ctrl+F5를 누르세요.
전체 수정 소스가 포함되어 있습니다. 기존 .env, data, uploads는 유지하세요.
