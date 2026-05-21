# rollback working no pause

재전송/멈춤 claim/lease 기능을 제거하고, 잘 동작하던 반복 수동사운드 구조로 되돌린 버전입니다.

수정:
- 수동사운드 ALERT/소리 재생 복구
- 대기열 전송 후 순차 재생
- 반복 횟수/남은 횟수 유지
- PC 모니터링은 monitor=1이면 대기열 소비 안 함
- 빵떠기/또영 하드코딩 제거
- API 실패 시 demoData 자동 표시 금지

URL:
- 방송용: /overlay.html?station=duugi&token=토큰&player=1&v=999999
- 모니터링: /overlay.html?station=duugi&token=토큰&monitor=1&v=999999
