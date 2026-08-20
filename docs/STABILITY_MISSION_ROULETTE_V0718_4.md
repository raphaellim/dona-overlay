# V0718.4 안정화

- control.html 미션타이머 입력칸을 1초 시계 갱신에서 분리
- 입력 중 dirty 상태에서는 서버값이 입력칸을 덮어쓰지 않음
- 룰렛 연속 실행은 다음 회차를 로컬 큐에서 즉시 재생하고 서버 advance는 백그라운드 순차 동기화
- 룰렛 관리 화면은 연속 실행 중 2.5초 저빈도 상태 확인
- saveEffectiveSettings의 중복 settings 조회 제거 (저장당 2회 -> 1회 조회)
- settings read-modify-write 서버 내 직렬화로 동시 저장 덮어쓰기 위험 완화
- 룰렛 상태 저장은 공유+방송별 데이터를 한 번의 settings read/write로 처리
