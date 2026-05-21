
# donation_overlay_restore_stable_fix

이번 버전은 최근 기능을 한 번에 다시 병합한 안정화 버전입니다.

포함 기능:
- 공지 표시 수정
  - settings.notice 문자열 구조 지원
  - notice.title/text/colors 객체 구조 지원
  - noticeTitle/noticeText/noticeColors flat 구조 지원
- 빵떠기/또영/또영이 하드코딩 기본값 제거
- ALERT를 creatorBox 밖으로 분리
  - 크리에이터박스 OFF여도 ALERT 표시
- 수동 사운드 소리/ALERT 복구
- player/monitor 분리
  - 방송용: /overlay.html?station=duugi&token=토큰&player=1
  - 모니터링: /overlay.html?station=duugi&token=토큰&monitor=1
- claim/lease 방식
- 멈춤/재전송 버튼 지원
- 반복 횟수/남은 횟수 유지
