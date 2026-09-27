OVERLAY2 0928 안정화/가독성 패치

사용 주소
  /overlay2.html?station=기존스테이션값
  기존 overlay.html 주소의 파일명만 overlay2.html로 바꾸면 됩니다.

계좌후원 1줄 등급
  일반: 300,000원 미만
  BRONZE: 300,000원 이상
  SILVER: 500,000원 이상
  GOLD: 1,000,000원 이상

안정화 변경
- Socket.IO를 WebSocket 전용으로 사용하고, 장애 시 기존 저빈도 fetch 안전동기화 사용
- 500ms ALERT 위치 감시 setInterval 제거 -> MutationObserver로 변경
- 중복 resize listener 제거
- 펀딩 롤링을 독립 단일 타이머로 변경해 refresh마다 timeout이 쌓이지 않도록 수정
- 펀딩 DOM은 실제 데이터 변경 시에만 재생성
- overlay 패널 backdrop-filter 제거 및 상시 GPU 합성 효과 축소
- 기존 이미지 슬라이드는 현재+다음 1장만 유지하는 기존 최적화 로직 유지

디자인
- 검정 고대비 통합 패널
- 계좌후원은 한 줄 랭킹형 UI
- 공지/크리에이터/노래방/펀딩은 네온 포인트 컬러
- GOLD/SILVER/BRONZE는 테두리와 금액/이름 컬러로 차등

원본 overlay.html은 수정하지 않았습니다.
