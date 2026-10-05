방송 오버레이 안정화 + 합산 UI + 최근 방송 7일 패치

[중요]
이 패치는 직전 '자동채팅 + 계좌후원자 명단' 패치를 포함한 누적 패치입니다.
server.js를 덮어써도 자동채팅 수정이 사라지지 않도록 최신 패치를 기준으로 만들었습니다.

덮어쓰기/추가 파일
1. server.js
2. public/summary.html
3. public/station_control.html
4. public/donor_history.html   (새 파일)
5. public/donation_chat_remote.html  (직전 자동채팅 패치 유지용)

1) 데이터/메모리 안정성 우선
- mediaListCache TTL 30초 + 최대 40개 제한
- 자동채팅 주기 상태 Map 24시간 정리 + 최대 100개 제한
- 방송 목록 API에 days/limit 지원
- station_control은 최근 7일/최대 30개 방송만 요청
- 방송목록별 설정 로딩도 화면에 필요한 방송만 수행
- summary.html의 5초 고정 전체 폴링 제거
- Socket.IO 변경 이벤트 중심 갱신 + 30초 안전 동기화
- 중복 summary 요청 차단
- 탭이 백그라운드일 때 불필요한 동기화 중지
- 페이지 종료 시 interval/socket 정리
- 펀딩 전체이력은 2분 이상 간격으로만 재조회

2) 합산 화면 UI 개선
- 상단 KPI: 총 후원 / 계좌 / 투네 / 후원자 수
- 크리에이터/후원자 합산 가독성 강화
- 후원자 검색
- 후원자 전체이력 바로가기
- 넓은 화면/모바일 반응형 개선
- 실시간 변경 시 자동 갱신

3) 방송 목록 단순화
- 방송국 컨트롤에 최근 7일 방송만 표시
- 오래된 종료 방송은 화면에서 숨김
- DB 데이터 자체는 삭제하지 않음
- 현재 활성 방송은 7일이 지나도 안전하게 목록에 포함

4) 후원자 전체이력 페이지 추가
주소:
 /donor_history.html?station=duugi
- 방송 구분 없이 같은 후원자명 전체 합산
- 계좌 / 투네 / 총합 / 후원횟수 / 최근후원
- 이름 검색 및 정렬
- 후원자 클릭 시 최근 100건 상세
- 상세에는 방송명 / 크리에이터 / 계좌 / 투네 표시
- 서버는 전체 donation 행을 한 번에 메모리에 적재하지 않고 1000행씩 순차 집계

적용 순서
GitHub 저장소 같은 경로에 덮어쓰기/추가
→ Commit
→ Railway Auto Deploy 완료 확인
→ 브라우저 Ctrl+F5

확인 주소
방송컨트롤:
https://dona-overlay-production.up.railway.app/station_control.html?station=duugi

합산:
https://dona-overlay-production.up.railway.app/summary.html?station=duugi

후원자 전체이력:
https://dona-overlay-production.up.railway.app/donor_history.html?station=duugi


[자동 후원 문구 v2]
기존: 💸용깡업(4) → 빵떠기2·화지2
변경: 💸용깡업(계좌 4) → 빵떠기2·화지2
투네: 💸용깡업(투네 4) → 빵떠기2·화지2
혼합: 💸용깡업(계좌+투네 4) → 빵떠기2·화지2


[누적채팅 v3]
- 크리에이터 설정 순서 그대로 출력
- 0원인 크리에이터도 생략하지 않음
예: 💰누적 💗빵떠기(10)·💙화지(0)·💛국고(0)·💜ㅇㄹ(3)
- 자동채팅/수동 현재현황 전송 둘 다 동일 적용
