# Donation Overlay V1 Plus Sections

지금까지 수정된 1차 최종본에 기능을 추가한 버전입니다.

추가:
- control.html에서 노래방창 ON/OFF
- control.html에서 펀딩창 ON/OFF
- control.html에서 방송시간 타이머 ON/OFF
- overlay.html에 노래방창 / 펀딩창 / 상단 방송시간 타이머 표시
- 계좌후원 표시: 이름 ♥ 금액
- 금액별 하트 색상
- 계좌후원 금액 폰트 축소

유지:
- 수동 사운드 ALERT / 소리 재생
- 대기열 전송 → 순차 재생
- 반복 횟수 / 남은 횟수 표시
- monitor=1은 대기열 소비 안 함
- 후원 ALERT
- 크리에이터박스 OFF 상태에서도 ALERT 표시
- 공지 제목/내용/줄바꿈/색상 표시
- 크리에이터 후원 표시 ON/OFF

제외:
- 재전송/멈춤/claim/lease 기능은 제외했습니다.

적용:
1. ZIP 전체 덮어쓰기
2. GitHub Commit
3. Supabase SQL Editor에서 donation_overlay_v1_plus_sections.sql 실행
4. Render 재배포
5. control.html에서 설정 저장
6. overlay.html 캐시 방지 URL로 확인

추가 보정:
- ALERT가 공지박스/계좌후원박스 가로폭 안에서 중앙 표시되도록 수정
- OBS 세로 화면에서 ALERT가 옆으로 튀는 현상 완화


## ALERT 기준 박스 강제 보정

- 기존 `.option-alert { position:fixed; left:50%; top:50%; }` 규칙을 강제로 무력화했습니다.
- `#overlayAlertRoot`는 공지박스/계좌박스/크리에이터박스의 좌표와 크기를 따라갑니다.
- `#optionAlert`는 `#overlayAlertRoot` 안에서 `position:absolute`로 중앙 표시됩니다.
