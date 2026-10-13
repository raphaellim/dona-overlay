# 콘솔 탭 전환·후원 목록 자동 갱신 충돌 수정

수정 대상: V5의 public/console.js 한 파일. 기존 HTML/CSS 디자인 수정과 함께 사용할 수 있습니다.

원인:
- 후원 목록의 웹소켓 갱신 예약이 다른 탭으로 이동해도 실행됨.
- 예약 함수가 실행 시점의 view 값을 읽어 방송 생성·선택 화면을 후원 목록으로 덮어씀.
- 하위 탭 클릭 시 화면 로딩 함수가 두 번 실행됨.
- 이전 화면의 늦은 응답이 새 화면을 덮어쓸 수 있음.

변경:
- 탭 이동 때 예약된 갱신 취소.
- 예약 당시 탭/하위 탭/화면 버전과 실행 시점을 비교.
- 이전 화면의 비동기 응답과 저장 완료 후 화면 이동을 무시.
- 하위 탭 로딩은 한 번만 실행, 선택 강조 동기화.
- URL에 방송국이 없으면 로그인 시 저장한 STATION_SLUG 사용.

적용:
1. 기존 public/console.js를 백업.
2. ZIP의 public/console.js만 같은 경로로 덮어쓰기.
3. GitHub Desktop Commit → Push → Railway 배포 완료 확인.
4. 브라우저 Ctrl+Shift+R.

방송국 duugi 접속:
https://dona-overlay-production.up.railway.app/console.html?station=duugi
사진의 default가 의도한 방송국이 아니라면 위 주소로 접속하세요.
SQL 변경, 앱 재설치, 콘솔 HTML/CSS 교체는 필요하지 않습니다.
운영 서버에 직접 배포하지 않았습니다.

검증: 실제 브라우저에서 하위 탭 1회 로딩, 예약된 WS 갱신 취소, 지연 응답 차단, 방송 생성 iframe 유지, JS 오류 없음이 통과했습니다.
