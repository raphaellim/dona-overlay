# v6.16.8.36 검증

## 통과한 추가 검증
- 닉네임: 정확 별칭, 앞뒤 문구 포함, 긴 이름 우선, 여러 후원자 보류, 방송국 격리.
- 실제 settings(id=3)의 $alertStudio 규칙/그룹/음원·이미지 경로/시작음/랜덤 설정 보존.
- 계좌 1·500·999원 제외 시 DB 접근과 알림 없음. 기존 >=1000 필터는 유지.
- 원문 금연 키워드와 24,000원 → 금연2, 문구 없는 배수 최대10 유지.
- 수집 승인과 수정 서버 경로: 기존 횟수 수정, 원본 이름 보관, 수정 시 알람 부가 처리 재실행 없음.
- PostgreSQL 실제 SQL: 최초 반영, 재시도, 동시 수정 충돌, 합계 오류 취소.
- 펀딩 +2.4 반영 후 취소, 분배 두 행으로 교체, 프리셋 횟수 변경, 실패 시 펀딩·분배 전부 롤백.
- 수정 이력 저장, 마이그레이션 두 번 실행, 다른 settings 항목 보존.
- Chromium: 204명 목록 15명 페이지·검색·별칭 저장, 원문/한국시간/기존 횟수 표시.
- Chromium: 승인된 내역 편집 payload(revision/requestId/프리셋 횟수/별칭 등록), 모바일 390px 가로 넘침 없음.
- 변경 JS 문법 검사 통과.
- 원본 alert-studio.js, public/alert-studio.html, public/sound-alert.js/html 바이트 일치.

## 원본에도 있는 전체 테스트 실패
업로드 원본을 별도 디렉터리에 그대로 풀고 동일한 의존성으로 npm test를 실행하여 비교했습니다.
아래 7개 실패는 원본에서도 재현되며 이번 패치에서 해당 기능을 고쳤다고 주장하지 않습니다.
1. account-receipts: production approval hook suppresses both alert and YouTube send...
2. collection-window: ingestion saves only current live broadcast...
3. donation-options: production batch handler ... one funding progress update...
4. finance: finance routes isolate stations ... reject stale edits
5. integrated-rules.test.js (기존 모의 DB 인터페이스 불일치)
6. routing.test.js (기존 auto/review 기대값 불일치)
7. unified-v5: queue bounded; password salted and compared safely

수집 승인 테스트 한 개는 펀딩·프리셋 동시 선택 금지라는 이번 분류 동작에 맞춰 갱신했고 정상 통과했습니다.
실제 금융 DB와 방송 장비에 연결하여 테스트하지 않았습니다.
